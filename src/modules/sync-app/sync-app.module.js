import { createBackup } from '../../services/backup.service.js?v=20261109-01';
import { getCurrentUser } from '../../services/auth.service.js?v=20261109-01';
import { hasPermission, requirePermission } from '../../services/permission.service.js?v=20261109-01';
import { getItem } from '../../services/storage.service.js?v=20261109-01';
import { STORAGE_KEYS } from '../../database/schema.js?v=20260804-06';
import { flushFinancialQueue, getFinancialSyncStatus } from '../../services/financial-sync.service.js?v=20261109-01';
import { escapeHtml } from '../../utils/dom.js?v=20260804-06';

export function initSyncAppModule(container) {
  const pendingFinancial = getItem(STORAGE_KEYS.financialSyncQueue, [])?.length || 0;
  const pendingShowcase = getItem(STORAGE_KEYS.showcaseSyncQueue, [])?.length || 0;
  const pendingAudit = (getItem(STORAGE_KEYS.auditLogs, []) || []).filter((entry) => entry.pendingSync === true).length;
  const financialStatus = getFinancialSyncStatus();
  container.innerHTML = `
    <section class="ui-screen sp">
      <header class="ui-head sp-head">
        <div class="sp-head__title">
          <h1 class="sp-title">Suporte</h1>
          <p class="sp-sub">Cópia deste aparelho, pendências de sincronização e recuperação.</p>
        </div>
      </header>
      <div class="ui-cols ui-cols--even">
        <div class="sp-col">
          <section class="ui-panel sp-panel">
            <h2 class="ui-head">Guardar uma cópia deste aparelho</h2>
            <p>O arquivo inclui os dados operacionais disponíveis neste navegador e as operações pendentes. Guarde-o em local protegido, com a data e o nome da loja.</p>
            <p>Esta cópia não inclui senhas, sessões, permissões de acesso, arquivos enviados ou todos os dados de outros aparelhos. O administrador deve manter também o backup do servidor.</p>
            ${hasPermission(getCurrentUser(), 'data.export') ? '<div class="sp-actions"><button type="button" class="ui-btn ui-btn--primary" data-backup-download>Baixar backup deste aparelho</button></div>' : '<p>Peça a exportação a um administrador autorizado.</p>'}
            <p class="sp-status" role="status" aria-live="polite" data-backup-status></p>
          </section>
          <section class="ui-panel sp-panel">
            <h2 class="ui-head">Recuperação assistida</h2>
            <p>O responsável deve validar a cópia em ambiente isolado e comparar vendas, estoque e caixa antes de planejar a recuperação do servidor. A restauração do sistema online exige esse procedimento acompanhado.</p>
          </section>
        </div>
        <div class="sp-col">
          <section class="ui-panel sp-panel">
            <h2 class="ui-head">Se a internet cair ou os valores divergirem</h2>
            <p>Pendências neste aparelho: financeiro ${pendingFinancial}, vitrine ${pendingShowcase}, auditoria ${pendingAudit}. Reabra esta tela para atualizar a contagem.</p>
            ${financialStatus.error ? `<p class="sp-alert" role="alert">Último erro financeiro: ${escapeHtml(financialStatus.error.message || financialStatus.error || 'não informado')}</p>` : ''}
            ${pendingFinancial ? '<div class="sp-actions"><button type="button" class="ui-btn" data-retry-financial>Sincronizar pendências agora</button></div>' : ''}
            <p>Auditorias pendentes de outro usuário aguardam que ele entre novamente para confirmar a autoria.</p>
            <ol>
              <li>Mantenha este navegador e seus dados; não limpe o armazenamento nem repita vendas já registradas.</li>
              <li>Confira o histórico e os avisos de sincronização do caixa e da vitrine antes de repetir uma operação.</li>
              <li>Guarde a cópia deste aparelho e informe ao responsável o horário, o número da venda e a mensagem exibida.</li>
            </ol>
          </section>
          <section class="ui-panel sp-panel">
            <h2 class="ui-head">Confirmação de pagamentos</h2>
            <p>Pix e cartões são registros manuais: confirme o recebimento no banco ou na maquininha antes de finalizar a venda.</p>
          </section>
        </div>
      </div>
    </section>
  `;
  container.querySelector('[data-backup-download]')?.addEventListener('click', () => {
    const status = container.querySelector('[data-backup-status]');
    try {
      requirePermission('data.export', getCurrentUser());
      const file = new Blob([createBackup()], { type: 'application/json' });
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = `pdv-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent = 'Download iniciado. Confira o arquivo na pasta de downloads e guarde uma cópia protegida.';
    } catch (error) {
      status.textContent = error.message || 'Não foi possível gerar o backup.';
    }
  });
  if (pendingFinancial) {
    container.querySelector('[data-retry-financial]')?.addEventListener('click', async (event) => {
      event.currentTarget.disabled = true;
      await flushFinancialQueue();
      initSyncAppModule(container);
    });
  }
}
