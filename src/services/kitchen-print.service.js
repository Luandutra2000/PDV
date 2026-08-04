import { STORAGE_KEYS } from '../database/schema.js?v=20260804-03';
import { getItem, setItem } from './storage.service.js?v=20260804-03';

export const KITCHEN_STATUSES = Object.freeze({
  pending: 'pendente',
  preparing: 'em_preparo',
  ready: 'pronto',
  delivered: 'entregue',
  canceled: 'cancelado'
});

export const PRINT_STATUSES = Object.freeze({
  pending: 'pendente',
  printing: 'imprimindo',
  printed: 'impresso',
  failed: 'falhou'
});

export function getKitchenOrders() {
  return getItem(STORAGE_KEYS.kitchenOrders, []);
}

export function getPrintJobs() {
  return getItem(STORAGE_KEYS.printJobs, []);
}

export function enqueueConfirmedSale(sale) {
  if (!sale?.id || !sale?.comandaId) {
    throw new Error('Venda invalida para envio a cozinha.');
  }

  const existing = getKitchenOrders().find((order) => order.saleId === sale.id && order.eventType === 'pedido');
  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  const order = {
    id: createId('kitchen'),
    saleId: sale.id,
    comandaId: sale.comandaId,
    comandaNumber: sale.comandaNumber,
    eventType: 'pedido',
    status: KITCHEN_STATUSES.pending,
    items: structuredCloneSafe(sale.items || []),
    createdAt: now,
    updatedAt: now,
    history: [{ status: KITCHEN_STATUSES.pending, at: now }]
  };
  setItem(STORAGE_KEYS.kitchenOrders, [...getKitchenOrders(), order]);
  enqueuePrintJob({
    deduplicationKey: `sale:${sale.id}:original`,
    saleId: sale.id,
    kitchenOrderId: order.id,
    documentType: 'pedido',
    copyType: 'original',
    payload: buildTicket(order)
  });
  return order;
}

export function updateKitchenOrderStatus(orderId, status) {
  if (!Object.values(KITCHEN_STATUSES).includes(status)) {
    throw new Error('Estado da cozinha invalido.');
  }
  const now = new Date().toISOString();
  return replaceKitchenOrder(orderId, (order) => ({
    ...order,
    status,
    updatedAt: now,
    history: [...order.history, { status, at: now }]
  }));
}

export function enqueueSaleCancellation(sale, reason = '') {
  if (!sale?.id) return null;
  const existing = getKitchenOrders().find((order) => order.saleId === sale.id && order.eventType === 'cancelamento');
  if (existing) return existing;

  const now = new Date().toISOString();
  const order = {
    id: createId('kitchen-cancel'),
    saleId: sale.id,
    comandaId: sale.comandaId,
    comandaNumber: sale.comandaNumber,
    eventType: 'cancelamento',
    status: KITCHEN_STATUSES.canceled,
    reason: String(reason || ''),
    items: structuredCloneSafe(sale.items || []),
    createdAt: now,
    updatedAt: now,
    history: [{ status: KITCHEN_STATUSES.canceled, at: now, reason: String(reason || '') }]
  };
  setItem(STORAGE_KEYS.kitchenOrders, [...getKitchenOrders(), order]);
  enqueuePrintJob({
    deduplicationKey: `sale:${sale.id}:cancelamento`,
    saleId: sale.id,
    kitchenOrderId: order.id,
    documentType: 'cancelamento',
    copyType: 'original',
    payload: buildTicket(order)
  });
  return order;
}

export function requestReprint(kitchenOrderId, { reason = '' } = {}) {
  const order = getKitchenOrders().find((candidate) => candidate.id === kitchenOrderId);
  if (!order) throw new Error('Pedido da cozinha nao encontrado.');
  const normalizedReason = String(reason || '').trim();
  if (!normalizedReason) throw new Error('Informe o motivo da reimpressao.');

  return enqueuePrintJob({
    deduplicationKey: `reprint:${order.id}:${createId('copy')}`,
    saleId: order.saleId,
    kitchenOrderId: order.id,
    documentType: order.eventType,
    copyType: 'reimpressao',
    reason: normalizedReason,
    payload: { ...buildTicket(order), copyLabel: 'REIMPRESSAO', reprintReason: normalizedReason }
  });
}

export async function processPrintJob(jobId, printer) {
  if (typeof printer !== 'function') throw new Error('Impressora nao configurada.');
  const job = requirePrintJob(jobId);
  if (job.status === PRINT_STATUSES.printed) return job;

  updatePrintJob(job.id, { status: PRINT_STATUSES.printing, lastError: '' });
  try {
    const result = await printer(job.payload);
    return updatePrintJob(job.id, {
      status: PRINT_STATUSES.printed,
      printerReference: String(result?.printerReference || ''),
      printedAt: new Date().toISOString(),
      attempts: job.attempts + 1
    });
  } catch (error) {
    updatePrintJob(job.id, {
      status: PRINT_STATUSES.failed,
      lastError: String(error?.message || 'Falha de impressao'),
      attempts: job.attempts + 1
    });
    throw error;
  }
}

function enqueuePrintJob(input) {
  const existing = getPrintJobs().find((job) => job.deduplicationKey === input.deduplicationKey);
  if (existing) return existing;
  const now = new Date().toISOString();
  const job = {
    id: createId('print'),
    ...input,
    status: PRINT_STATUSES.pending,
    attempts: 0,
    lastError: '',
    printerReference: '',
    createdAt: now,
    updatedAt: now
  };
  setItem(STORAGE_KEYS.printJobs, [...getPrintJobs(), job]);
  return job;
}

function replaceKitchenOrder(orderId, transform) {
  let updated = null;
  const orders = getKitchenOrders().map((order) => {
    if (order.id !== orderId) return order;
    updated = transform(order);
    return updated;
  });
  if (!updated) throw new Error('Pedido da cozinha nao encontrado.');
  setItem(STORAGE_KEYS.kitchenOrders, orders);
  return updated;
}

function requirePrintJob(jobId) {
  const job = getPrintJobs().find((candidate) => candidate.id === jobId);
  if (!job) throw new Error('Trabalho de impressao nao encontrado.');
  return job;
}

function updatePrintJob(jobId, changes) {
  let updated = null;
  const jobs = getPrintJobs().map((job) => {
    if (job.id !== jobId) return job;
    updated = { ...job, ...changes, updatedAt: new Date().toISOString() };
    return updated;
  });
  setItem(STORAGE_KEYS.printJobs, jobs);
  return updated;
}

function buildTicket(order) {
  return {
    title: order.eventType === 'cancelamento' ? 'CANCELAMENTO' : 'PEDIDO COZINHA',
    comandaNumber: order.comandaNumber,
    eventType: order.eventType,
    reason: order.reason || '',
    items: structuredCloneSafe(order.items)
  };
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
