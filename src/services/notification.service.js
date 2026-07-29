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
  const content = document.createElement('div');
  const heading = document.createElement('strong');
  const paragraph = document.createElement('p');
  const closeButton = document.createElement('button');
  heading.textContent = String(title ?? '');
  paragraph.textContent = String(message ?? '');
  closeButton.type = 'button';
  closeButton.className = 'app-toast__close';
  closeButton.setAttribute('aria-label', 'Fechar');
  closeButton.textContent = 'X';
  content.append(heading, paragraph);
  notification.append(content, closeButton);

  notificationRoot.appendChild(notification);
  closeButton.addEventListener('click', () => notification.remove());
  setTimeout(() => notification.remove(), 4200);
}
