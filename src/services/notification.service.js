let notificationRoot = null;

export function initNotificationService(root) {
  notificationRoot = root;
}

export function showNotification({ title, message, type = 'success' }) {
  if (!notificationRoot) {
    return;
  }

  const notification = document.createElement('div');
  notification.className = `app-toast app-toast--${type}`;
  notification.innerHTML = `
    <div>
      <strong>${title}</strong>
      <p>${message}</p>
    </div>
    <button type="button" class="app-toast__close" aria-label="Fechar">X</button>
  `;

  notificationRoot.appendChild(notification);
  notification.querySelector('button').addEventListener('click', () => notification.remove());
  setTimeout(() => notification.remove(), 4200);
}
