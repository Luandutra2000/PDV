import { createBackup } from '../../services/backup.service.js?v=20260804-06';
import { getCurrentUser } from '../../services/auth.service.js?v=20260804-06';
import { hasPermission, requirePermission } from '../../services/permission.service.js?v=20260804-06';
import { getItem } from '../../services/storage.service.js?v=20260804-06';
import { STORAGE_KEYS } from '../../database/schema.js?v=20260804-06';

export function initSyncAppModule(container) {
  const pendingFinancial = getItem(STORAGE_KEYS.financialSyncQueue, [])?.length || 0;
  const pendingShowcase = getItem(STORAGE_KEYS.showcaseSyncQueue, [])?.length || 0;
  const pendingAudit = (getItem(STORAGE_KEYS.auditLogs, []) || []).filter((entry) => entry.pendingSync === true).length;
  container.innerHTML = `
    <section class="module-screen">
      <header class="module-header"><h1 class="pdv-title">Suporte e recuperação</h1></header>
      <section class="panel">
        <h2>Guardar uma cópia deste aparelho</h2>
        <p>O arquivo inclui os dados operacionais disponíveis neste navegador e as operações pendentes. Guarde-o em local protegido, com a data e o nome da loja.</p>
        <p>Esta cópia não inclui senhas, sessões, permissões de acesso, arquivos enviados ou todos os dados de outros aparelhos. O administrador deve manter também o backup do servidor.</p>
        ${hasPermission(getCurrentUser(), 'data.export') ? '<button type="button" class="button button--primary" data-backup-download>Baixar backup deste aparelho</button>' : '<p>Peça a exportação a um administrador autorizado.</p>'}
        <p role="status" aria-live="polite" data-backup-status></p>
      </section>
      <section class="panel">
        <h2>Se a internet cair ou os valores divergirem</h2>
        <p>Pendências neste aparelho: financeiro ${pendingFinancial}, vitrine ${pendingShowcase}, auditoria ${pendingAudit}. Reabra esta tela para atualizar a contagem.</p>
        <p>Auditorias pendentes de outro usuário aguardam que ele entre novamente para confirmar a autoria.</p>
        <ol>
          <li>Mantenha este navegador e seus dados; não limpe o armazenamento nem repita vendas já registradas.</li>
          <li>Confira o histórico e os avisos de sincronização do caixa e da vitrine antes de repetir uma operação.</li>
          <li>Guarde a cópia deste aparelho e informe ao responsável o horário, o número da venda e a mensagem exibida.</li>
        </ol>
        <h2>Recuperação assistida</h2>
        <p>O responsável deve validar a cópia em ambiente isolado e comparar vendas, estoque e caixa antes de planejar a recuperação do servidor. A restauração do sistema online exige esse procedimento acompanhado.</p>
        <h2>Confirmação de pagamentos</h2>
        <p>Pix e cartões são registros manuais: confirme o recebimento no banco ou na maquininha antes de finalizar a venda.</p>
      </section>
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
}
