const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const { renderClearHistoryModal } = await import('../src/modules/dashboard/dashboard.module.js');

const modal = renderClearHistoryModal();

assert(modal.includes('Limpar historico?'), 'clear history modal should show confirmation title');
assert(modal.includes('confirm-clear-history'), 'clear history modal should include confirm action');
assert(modal.includes('close-modal'), 'clear history modal should include cancel action');

console.log('dashboard module ok');
