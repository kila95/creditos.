import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Bluetooth,
  BluetoothConnected,
  BluetoothOff,
  Printer,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
  RefreshCw,
  Terminal,
  Scissors,
  AlignCenter,
} from 'lucide-react';

// ============================================================================
// DEFINICIÓN DE TIPOS WEB BLUETOOTH API & COMANDOS ESC/POS
// ============================================================================

export interface ThermalReceiptPayload {
  organizationName?: string;
  receiptNumber: string;
  clientName: string;
  clientDocument?: string;
  routeName?: string;
  collectorName?: string;
  amountPaid: number;
  previousBalance?: number;
  newBalance: number;
  paymentDate?: string;
  notes?: string;
}

export interface BluetoothPrintManagerProps {
  receiptData?: ThermalReceiptPayload;
  compact?: boolean;
  autoPrintOnMount?: boolean;
  onPrintSuccess?: (deviceName: string, receiptNumber: string) => void;
  onPrintError?: (errorMessage: string) => void;
}

// UUIDs estándar utilizados por impresoras térmicas portátiles BLE (58mm / 80mm)
const THERMAL_PRINTER_SERVICE_UUIDS = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Estándar GATT Thermal Printer (MPT-II, Goojprt, Bisofice)
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Star / Xprinter BLE Service
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // Microchip ISSC Transparent UART
  '0000ff00-0000-1000-8000-00805f9b34fb', // Impresoras genéricas BLE POS
  '0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10 / UART BLE Serial
];

// Tamaño seguro de fragmento por paquete GATT para evitar desbordamiento de MTU en Bluetooth LE
const BLE_CHUNK_SIZE = 100;

// ============================================================================
// CODIFICADOR BASE ESC/POS (TEXTO, SALTOS DE LÍNEA, ALINEACIÓN, CORTE DE PAPEL)
// ============================================================================

export const EscPosCommands = {
  /** Inicializa la impresora y limpia el buffer (ESC @ -> 0x1B 0x40) */
  init(): Uint8Array {
    return new Uint8Array([0x1b, 0x40]);
  },

  /** Salto de línea básico (LF -> 0x0A) o múltiples saltos (ESC d n -> 0x1B 0x64 n) */
  lineFeed(lines = 1): Uint8Array {
    if (lines <= 1) {
      return new Uint8Array([0x0a]);
    }
    return new Uint8Array([0x1b, 0x64, Math.min(255, Math.max(1, lines))]);
  },

  /** Alineación de texto: 'left' (0), 'center' (1), 'right' (2) -> (ESC a n -> 0x1B 0x61 n) */
  align(mode: 'left' | 'center' | 'right'): Uint8Array {
    const map = { left: 0x00, center: 0x01, right: 0x02 };
    return new Uint8Array([0x1b, 0x61, map[mode]]);
  },

  /** Activa o desactiva negrita (ESC E n -> 0x1B 0x45 n) */
  bold(enabled: boolean): Uint8Array {
    return new Uint8Array([0x1b, 0x45, enabled ? 0x01 : 0x00]);
  },

  /** Tamaño de fuente: normal (1x1) o doble alto/ancho (GS ! n -> 0x1D 0x21 n) */
  textSize(doubleWidth = false, doubleHeight = false): Uint8Array {
    const n = (doubleWidth ? 0x10 : 0x00) | (doubleHeight ? 0x01 : 0x00);
    return new Uint8Array([0x1d, 0x21, n]);
  },

  /** Normaliza caracteres con tildes/ñ a ASCII seguro para impresoras térmicas y codifica bytes */
  encodeText(rawText: string, appendLineFeed = true): Uint8Array {
    const normalized = rawText
      .replace(/[áàäâ]/g, 'a')
      .replace(/[éèëê]/g, 'e')
      .replace(/[íìïî]/g, 'i')
      .replace(/[óòöô]/g, 'o')
      .replace(/[úùüû]/g, 'u')
      .replace(/[ÁÀÄÂ]/g, 'A')
      .replace(/[ÉÈËÊ]/g, 'E')
      .replace(/[ÍÌÏÎ]/g, 'I')
      .replace(/[ÓÒÖÔ]/g, 'O')
      .replace(/[ÚÙÜÛ]/g, 'U')
      .replace(/ñ/g, 'n')
      .replace(/Ñ/g, 'N');

    const encoder = new TextEncoder();
    const textBytes = encoder.encode(normalized);

    if (!appendLineFeed) {
      return textBytes;
    }

    const result = new Uint8Array(textBytes.length + 1);
    result.set(textBytes, 0);
    result[textBytes.length] = 0x0a; // LF
    return result;
  },

  /** Línea divisoria para tirillas de 58mm (32 caracteres por línea) */
  divider(char = '-', width = 32): Uint8Array {
    return EscPosCommands.encodeText(char.repeat(width), true);
  },

  /** Avance de papel y corte parcial/total (GS V m n -> 0x1D 0x56 0x42 0x00) */
  cutPaper(feedLinesBeforeCut = 3): Uint8Array {
    const feed = EscPosCommands.lineFeed(feedLinesBeforeCut);
    const cut = new Uint8Array([0x1d, 0x56, 0x42, 0x00]);
    return EscPosCommands.concat([feed, cut]);
  },

  /** Concatena múltiples buffers Uint8Array en un único flujo binario ESC/POS */
  concat(buffers: Uint8Array[]): Uint8Array {
    const totalLength = buffers.reduce((acc, buf) => acc + buf.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const buf of buffers) {
      combined.set(buf, offset);
      offset += buf.length;
    }
    return combined;
  },
};

/**
 * Construye el buffer binario ESC/POS completo para un comprobante de abono en tirilla de 58mm.
 */
export function buildReceiptEscPosBuffer(receipt: ThermalReceiptPayload): Uint8Array {
  const formatCOP = (val: number) =>
    `$${Math.round(val).toLocaleString('es-CO')}`;

  const dateStr =
    receipt.paymentDate ||
    new Date().toLocaleString('es-CO', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

  const parts: Uint8Array[] = [
    EscPosCommands.init(),
    // Encabezado centrado
    EscPosCommands.align('center'),
    EscPosCommands.bold(true),
    EscPosCommands.textSize(false, true),
    EscPosCommands.encodeText(receipt.organizationName || 'ENRUTA MICROCREDITO'),
    EscPosCommands.textSize(false, false),
    EscPosCommands.bold(false),
    EscPosCommands.encodeText('COMPROBANTE DE ABONO'),
    EscPosCommands.divider('='),

    // Cuerpo alineado a la izquierda
    EscPosCommands.align('left'),
    EscPosCommands.encodeText(`Recibo No: ${receipt.receiptNumber}`),
    EscPosCommands.encodeText(`Fecha: ${dateStr}`),
    ...(receipt.routeName ? [EscPosCommands.encodeText(`Ruta: ${receipt.routeName}`)] : []),
    ...(receipt.collectorName
      ? [EscPosCommands.encodeText(`Cobrador: ${receipt.collectorName}`)]
      : []),
    EscPosCommands.divider('-'),

    // Datos del cliente
    EscPosCommands.bold(true),
    EscPosCommands.encodeText(`Cliente: ${receipt.clientName}`),
    EscPosCommands.bold(false),
    ...(receipt.clientDocument
      ? [EscPosCommands.encodeText(`CC/NIT: ${receipt.clientDocument}`)]
      : []),
    EscPosCommands.divider('-'),

    // Detalle financiero
    ...(typeof receipt.previousBalance === 'number'
      ? [EscPosCommands.encodeText(`Saldo Anterior: ${formatCOP(receipt.previousBalance)}`)]
      : []),
    EscPosCommands.bold(true),
    EscPosCommands.encodeText(`ABONO RECIBIDO: ${formatCOP(receipt.amountPaid)}`),
    EscPosCommands.encodeText(`NUEVO SALDO:    ${formatCOP(receipt.newBalance)}`),
    EscPosCommands.bold(false),
    EscPosCommands.divider('='),

    // Observaciones y pie de tirilla
    ...(receipt.notes ? [EscPosCommands.encodeText(`Obs: ${receipt.notes}`)] : []),
    EscPosCommands.align('center'),
    EscPosCommands.encodeText('Gracias por su pago puntual'),
    EscPosCommands.encodeText('Conserve este soporte'),
    EscPosCommands.cutPaper(4),
  ];

  return EscPosCommands.concat(parts);
}

// ============================================================================
// COMPONENTE REACT COMPLETO: BluetoothPrintManager
// ============================================================================

export const BluetoothPrintManager: React.FC<BluetoothPrintManagerProps> = ({
  receiptData,
  compact = false,
  autoPrintOnMount = false,
  onPrintSuccess,
  onPrintError,
}) => {
  const [isSupported, setIsSupported] = useState<boolean>(true);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [connectedDeviceName, setConnectedDeviceName] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Estado editable cuando se abre la vista completa de Impresión Bluetooth
  const [customClientName, setCustomClientName] = useState<string>(
    receiptData?.clientName || 'Carlos Mario Restrepo'
  );
  const [customAmountPaid, setCustomAmountPaid] = useState<number>(
    receiptData?.amountPaid || 45000
  );
  const [customPreviousBalance, setCustomPreviousBalance] = useState<number>(
    receiptData?.previousBalance ?? 360000
  );
  const [customNotes, setCustomNotes] = useState<string>(
    receiptData?.notes || 'Cuota diaria pagada en efectivo'
  );

  // Referencias al dispositivo y característica GATT de escritura
  const bluetoothDeviceRef = useRef<any>(null);
  const writeCharacteristicRef = useRef<any>(null);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('bluetooth' in navigator)) {
      setIsSupported(false);
    }
  }, []);

  // Recibo activo (desde props o desde el generador en vista completa)
  const activeReceipt: ThermalReceiptPayload = useMemo(() => {
    if (receiptData) return receiptData;
    const computedNewBalance = Math.max(0, customPreviousBalance - customAmountPaid);
    return {
      organizationName: 'ENRUTA MICROCREDITO',
      receiptNumber: `RC-${Date.now().toString().slice(-6)}`,
      clientName: customClientName || 'Cliente en Ruta',
      clientDocument: '1.017.248.910',
      routeName: 'Ruta Medellin Centro',
      collectorName: 'Operador EnRuta',
      previousBalance: customPreviousBalance,
      amountPaid: customAmountPaid,
      newBalance: computedNewBalance,
      paymentDate: new Date().toLocaleString('es-CO'),
      notes: customNotes,
    };
  }, [
    receiptData,
    customClientName,
    customAmountPaid,
    customPreviousBalance,
    customNotes,
  ]);

  // Buffer ESC/POS calculado en vivo para inspección y transmisión
  const liveEscPosBuffer = useMemo(
    () => buildReceiptEscPosBuffer(activeReceipt),
    [activeReceipt]
  );

  const handleDisconnected = useCallback(() => {
    writeCharacteristicRef.current = null;
    setConnectedDeviceName(null);
    setStatusMessage('Impresora Bluetooth desconectada.');
  }, []);

  /**
   * Escanea impresoras Bluetooth cercanas y descubre dinámicamente la característica GATT de escritura.
   */
  const scanAndConnectPrinter = useCallback(async (): Promise<boolean> => {
    setErrorMessage(null);
    setStatusMessage(null);

    const nav = navigator as any;
    if (!nav?.bluetooth) {
      const msg =
        'Este navegador no soporta Web Bluetooth API. Usa Google Chrome o Microsoft Edge en Android o Desktop con HTTPS.';
      setErrorMessage(msg);
      onPrintError?.(msg);
      return false;
    }

    setIsScanning(true);

    try {
      const device = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: THERMAL_PRINTER_SERVICE_UUIDS,
      });

      if (!device) {
        throw new Error('No se seleccionó ninguna impresora Bluetooth.');
      }

      device.addEventListener('gattserverdisconnected', handleDisconnected);
      bluetoothDeviceRef.current = device;

      const server = await device.gatt.connect();
      const services = await server.getPrimaryServices();

      let writableChar: any = null;

      for (const service of services) {
        const characteristics = await service.getCharacteristics();
        for (const char of characteristics) {
          if (char.properties.write || char.properties.writeWithoutResponse) {
            writableChar = char;
            break;
          }
        }
        if (writableChar) break;
      }

      if (!writableChar) {
        throw new Error(
          'Dispositivo vinculado, pero no expone una característica GATT con permiso de escritura ESC/POS.'
        );
      }

      writeCharacteristicRef.current = writableChar;
      const name = device.name || 'Impresora Térmica Portátil 58mm';
      setConnectedDeviceName(name);
      setStatusMessage(`Conectado exitosamente a "${name}". Canal GATT ESC/POS activo.`);
      return true;
    } catch (err: any) {
      if (err?.name === 'NotFoundError') {
        setStatusMessage('Escaneo de dispositivos Bluetooth cancelado.');
      } else {
        const msg = err?.message || 'Error al vincular la impresora térmica Bluetooth.';
        setErrorMessage(msg);
        onPrintError?.(msg);
      }
      return false;
    } finally {
      setIsScanning(false);
    }
  }, [handleDisconnected, onPrintError]);

  /**
   * Desconecta la impresora térmica actual.
   */
  const disconnectPrinter = useCallback(() => {
    try {
      if (bluetoothDeviceRef.current?.gatt?.connected) {
        bluetoothDeviceRef.current.gatt.disconnect();
      }
    } finally {
      writeCharacteristicRef.current = null;
      setConnectedDeviceName(null);
      setStatusMessage('Conexión Bluetooth cerrada.');
    }
  }, []);

  /**
   * Envía un flujo de bytes ESC/POS fragmentado hacia la característica GATT.
   */
  const sendEscPosBytes = useCallback(async (payload: Uint8Array) => {
    const characteristic = writeCharacteristicRef.current;
    if (!characteristic) {
      throw new Error('No hay ninguna impresora térmica conectada.');
    }

    for (let offset = 0; offset < payload.length; offset += BLE_CHUNK_SIZE) {
      const chunk = payload.slice(offset, offset + BLE_CHUNK_SIZE);
      if (
        characteristic.properties.writeWithoutResponse &&
        characteristic.writeValueWithoutResponse
      ) {
        await characteristic.writeValueWithoutResponse(chunk);
      } else {
        await characteristic.writeValue(chunk);
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }, []);

  /**
   * Envía un comando ESC/POS puntual (ej. avance de línea o corte de papel).
   */
  const handleSendQuickCommand = useCallback(
    async (commandType: 'feed' | 'cut' | 'init') => {
      setErrorMessage(null);
      setStatusMessage(null);

      try {
        if (!writeCharacteristicRef.current) {
          const ok = await scanAndConnectPrinter();
          if (!ok) return;
        }

        if (commandType === 'feed') {
          await sendEscPosBytes(EscPosCommands.lineFeed(3));
          setStatusMessage('Comando enviado: Avance de 3 líneas (ESC d 3).');
        } else if (commandType === 'cut') {
          await sendEscPosBytes(EscPosCommands.cutPaper(2));
          setStatusMessage('Comando enviado: Corte parcial de papel (GS V 66 0).');
        } else {
          await sendEscPosBytes(EscPosCommands.init());
          setStatusMessage('Comando enviado: Inicialización de cabezal (ESC @).');
        }
      } catch (err: any) {
        setErrorMessage(err?.message || 'No se pudo enviar el comando ESC/POS.');
      }
    },
    [scanAndConnectPrinter, sendEscPosBytes]
  );

  /**
   * Imprime la tirilla completa de abono en formato ESC/POS.
   */
  const handlePrintReceipt = useCallback(
    async (customReceipt?: ThermalReceiptPayload) => {
      setErrorMessage(null);
      setStatusMessage(null);
      setIsPrinting(true);

      try {
        if (!writeCharacteristicRef.current) {
          const connected = await scanAndConnectPrinter();
          if (!connected) {
            setIsPrinting(false);
            return;
          }
        }

        const targetReceipt = customReceipt || activeReceipt;
        const escPosBuffer = buildReceiptEscPosBuffer(targetReceipt);
        await sendEscPosBytes(escPosBuffer);

        const deviceLabel = connectedDeviceName || 'Impresora Térmica BLE';
        setStatusMessage(
          `Tirilla #${targetReceipt.receiptNumber} impresa en ${deviceLabel} (${escPosBuffer.length} bytes ESC/POS enviados).`
        );
        onPrintSuccess?.(deviceLabel, targetReceipt.receiptNumber);
      } catch (err: any) {
        const msg = err?.message || 'Error enviando comandos ESC/POS a la impresora.';
        setErrorMessage(msg);
        onPrintError?.(msg);
      } finally {
        setIsPrinting(false);
      }
    },
    [
      activeReceipt,
      connectedDeviceName,
      onPrintError,
      onPrintSuccess,
      scanAndConnectPrinter,
      sendEscPosBytes,
    ]
  );

  useEffect(() => {
    if (autoPrintOnMount && receiptData && writeCharacteristicRef.current) {
      handlePrintReceipt(receiptData);
    }
  }, [autoPrintOnMount, receiptData, handlePrintReceipt]);

  // Vista compacta para embeber dentro del Modal de Comprobante Digital
  if (compact) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Bluetooth
              className={`w-4 h-4 ${
                connectedDeviceName ? 'text-emerald-400' : 'text-indigo-400'
              }`}
            />
            <span className="text-xs font-bold text-white">
              Impresión Térmica Bluetooth (58mm)
            </span>
          </div>
          <span
            className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
              connectedDeviceName
                ? 'bg-emerald-950/70 text-emerald-300 border-emerald-500/30'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            {connectedDeviceName || 'Sin vincular'}
          </span>
        </div>

        {errorMessage && (
          <div className="bg-rose-950/50 border border-rose-500/40 rounded-xl p-2.5 text-[11px] text-rose-200 flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {statusMessage && (
          <div className="bg-emerald-950/50 border border-emerald-500/40 rounded-xl p-2.5 text-[11px] text-emerald-200 flex items-start gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
            <span>{statusMessage}</span>
          </div>
        )}

        <div className="flex gap-2">
          {!connectedDeviceName && (
            <button
              type="button"
              onClick={scanAndConnectPrinter}
              disabled={isScanning || !isSupported}
              className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              {isScanning ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Bluetooth className="w-3.5 h-3.5 text-indigo-400" />
              )}
              <span>Vincular</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => handlePrintReceipt(activeReceipt)}
            disabled={isPrinting || !isSupported}
            className="flex-1 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            {isPrinting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Imprimiendo ESC/POS...</span>
              </>
            ) : (
              <>
                <Printer className="w-4 h-4" />
                <span>Imprimir Tirilla Física (Bluetooth)</span>
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  // Vista completa del Módulo 1: Centro de Impresión Térmica Bluetooth (ESC/POS)
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Encabezado Principal */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center border shrink-0 ${
              connectedDeviceName
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                : 'bg-indigo-500/15 border-indigo-500/30 text-indigo-400'
            }`}
          >
            {connectedDeviceName ? (
              <BluetoothConnected className="w-6 h-6" />
            ) : isSupported ? (
              <Bluetooth className="w-6 h-6" />
            ) : (
              <BluetoothOff className="w-6 h-6 text-rose-400" />
            )}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
                Módulo 1 · Impresión Térmica Bluetooth (ESC/POS)
              </h2>
              <span
                className={`text-[11px] font-mono px-2.5 py-0.5 rounded-md border font-bold ${
                  connectedDeviceName
                    ? 'bg-emerald-950/70 text-emerald-300 border-emerald-500/30'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                {connectedDeviceName ? `CONECTADA: ${connectedDeviceName}` : 'SIN CONEXIÓN BLE'}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Escaneo de impresoras portátiles de 58mm/80mm mediante <code className="text-indigo-300 font-mono">navigator.bluetooth</code> y transmisión binaria de comandos ESC/POS.
            </p>
          </div>
        </div>

        {/* Botón de Escaneo / Desconexión */}
        <div className="flex items-center gap-2 shrink-0">
          {connectedDeviceName ? (
            <button
              type="button"
              onClick={disconnectPrinter}
              className="px-4 py-2.5 rounded-xl bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-700/60 text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
            >
              <BluetoothOff className="w-4 h-4" />
              <span>Desconectar Impresora</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={scanAndConnectPrinter}
              disabled={isScanning || !isSupported}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs sm:text-sm font-bold flex items-center gap-2 shadow-lg shadow-indigo-950/50 transition-all cursor-pointer"
            >
              {isScanning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Escaneando Bluetooth...</span>
                </>
              ) : (
                <>
                  <Bluetooth className="w-4 h-4" />
                  <span>Escanear y Vincular Impresora</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Mensajes de estado o error */}
      {errorMessage && (
        <div className="bg-rose-950/60 border border-rose-500/40 rounded-2xl p-4 flex items-start gap-3 text-xs sm:text-sm text-rose-200">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-rose-300">Error de comunicación Bluetooth / ESC-POS</p>
            <p className="mt-0.5">{errorMessage}</p>
          </div>
        </div>
      )}

      {statusMessage && (
        <div className="bg-emerald-950/60 border border-emerald-500/40 rounded-2xl p-4 flex items-start gap-3 text-xs sm:text-sm text-emerald-200">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-emerald-300">Estado de la Impresora</p>
            <p className="mt-0.5">{statusMessage}</p>
          </div>
        </div>
      )}

      {/* Grilla Principal: Configurador + Comandos Base ESC/POS vs Vista Previa Tirilla 58mm */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Columna Izquierda (7 cols): Datos del Abono y Comandos Directos ESC/POS */}
        <div className="lg:col-span-7 space-y-6">
          {/* Formulario de Datos de Abono para Prueba / Impresión */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-400" />
                <span>Datos del Abono a Codificar en ESC/POS</span>
              </h3>
              <span className="text-[11px] font-mono text-slate-400">
                Ancho papel: 58mm (32 cols)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Nombre del Cliente
                </label>
                <input
                  type="text"
                  value={customClientName}
                  onChange={(e) => setCustomClientName(e.target.value)}
                  disabled={Boolean(receiptData)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Saldo Anterior (COP)
                </label>
                <input
                  type="number"
                  value={customPreviousBalance}
                  onChange={(e) => setCustomPreviousBalance(Number(e.target.value || 0))}
                  disabled={Boolean(receiptData)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs sm:text-sm text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Abono Recibido (COP)
                </label>
                <input
                  type="number"
                  value={customAmountPaid}
                  onChange={(e) => setCustomAmountPaid(Number(e.target.value || 0))}
                  disabled={Boolean(receiptData)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs sm:text-sm text-emerald-400 font-mono font-bold focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Observación en Tirilla
                </label>
                <input
                  type="text"
                  value={customNotes}
                  onChange={(e) => setCustomNotes(e.target.value)}
                  disabled={Boolean(receiptData)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Botones de Acción de Comandos Base ESC/POS */}
            <div className="pt-3 border-t border-slate-800 space-y-2.5">
              <p className="text-xs font-semibold text-slate-400">
                Comandos de Control Hardware ESC/POS:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleSendQuickCommand('init')}
                  disabled={isPrinting || !isSupported}
                  className="py-2.5 px-3 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <AlignCenter className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Inicializar (ESC @)</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSendQuickCommand('feed')}
                  disabled={isPrinting || !isSupported}
                  className="py-2.5 px-3 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Salto 3 Líneas (ESC d)</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSendQuickCommand('cut')}
                  disabled={isPrinting || !isSupported}
                  className="py-2.5 px-3 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Scissors className="w-3.5 h-3.5 text-amber-400" />
                  <span>Corte Papel (GS V)</span>
                </button>
              </div>
            </div>
          </div>

          {/* Inspector de Trama Binaria ESC/POS */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                Buffer Binario ESC/POS Generado ({liveEscPosBuffer.length} bytes)
              </h3>
              <span className="text-[11px] font-mono text-emerald-400">
                MTU Chunk: {BLE_CHUNK_SIZE}B
              </span>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-[11px] text-slate-400 overflow-x-auto leading-relaxed">
              <div>
                <span className="text-indigo-400">INIT:</span> 0x1B 0x40 |{' '}
                <span className="text-emerald-400">ALIGN_CENTER:</span> 0x1B 0x61 0x01 |{' '}
                <span className="text-amber-400">BOLD_ON:</span> 0x1B 0x45 0x01 |{' '}
                <span className="text-rose-400">CUT_PAPER:</span> 0x1D 0x56 0x42 0x00
              </div>
              <div className="mt-1.5 text-[10px] text-slate-500 break-all">
                HEX PREVIEW:{' '}
                {Array.from(liveEscPosBuffer.slice(0, 48))
                  .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
                  .join(' ')}{' '}
                ...
              </div>
            </div>
          </div>
        </div>

        {/* Columna Derecha (5 cols): Simulación Visual de Tirilla Térmica de 58mm + Botón Imprimir */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white flex items-center gap-2">
              <Printer className="w-4 h-4 text-emerald-400" />
              Vista Previa Tirilla Térmica (58mm)
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              #{activeReceipt.receiptNumber}
            </span>
          </div>

          {/* Papel térmico simulado */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 font-mono text-xs text-slate-200 space-y-2 shadow-inner">
            <div className="text-center space-y-0.5 pb-2 border-b border-dashed border-slate-700">
              <p className="text-sm font-black text-white tracking-wider">
                {activeReceipt.organizationName || 'ENRUTA MICROCREDITO'}
              </p>
              <p className="text-[11px] text-emerald-400 font-bold">
                COMPROBANTE DE ABONO
              </p>
            </div>

            <div className="space-y-1 text-[11px] pt-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Recibo No:</span>
                <span className="text-white font-semibold">{activeReceipt.receiptNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Fecha:</span>
                <span>{activeReceipt.paymentDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Ruta:</span>
                <span>{activeReceipt.routeName || 'Ruta Principal'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Cliente:</span>
                <span className="text-white font-bold">{activeReceipt.clientName}</span>
              </div>
            </div>

            <div className="py-2.5 border-y border-dashed border-slate-700 space-y-1">
              {typeof activeReceipt.previousBalance === 'number' && (
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Saldo Anterior:</span>
                  <span>
                    ${Math.round(activeReceipt.previousBalance).toLocaleString('es-CO')}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-xs font-extrabold text-emerald-400">
                <span>ABONO RECIBIDO:</span>
                <span>
                  ${Math.round(activeReceipt.amountPaid).toLocaleString('es-CO')}
                </span>
              </div>
              <div className="flex justify-between text-xs font-extrabold text-white">
                <span>NUEVO SALDO:</span>
                <span>
                  ${Math.round(activeReceipt.newBalance).toLocaleString('es-CO')}
                </span>
              </div>
            </div>

            {activeReceipt.notes && (
              <p className="text-[11px] text-slate-400">Obs: {activeReceipt.notes}</p>
            )}

            <div className="pt-2 text-center text-[10px] text-slate-500">
              <p>Gracias por su pago puntual</p>
              <p>Conserve este soporte</p>
            </div>
          </div>

          {/* Botón Principal para Imprimir Tirilla por Bluetooth */}
          <button
            type="button"
            onClick={() => handlePrintReceipt(activeReceipt)}
            disabled={isPrinting || !isSupported}
            className="w-full py-3.5 px-5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
          >
            {isPrinting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Transmitiendo a Impresora Bluetooth...</span>
              </>
            ) : (
              <>
                <Printer className="w-5 h-5" />
                <span>Imprimir Comprobante en Impresora Térmica</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BluetoothPrintManager;
