// Lista de permissao para o logo da empresa: so imagens embutidas (data:image)
// e URLs http/https. Usado pela barra lateral e pela tela de entrar.
export function isAllowedLogoUrl(logoUrl) {
  if (!logoUrl || typeof logoUrl !== 'string') {
    return false;
  }

  const value = logoUrl.trim();
  const allowedDataImagePattern = /^data:image\/(?:png|jpe?g|webp|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/i;

  if (allowedDataImagePattern.test(value)) {
    return true;
  }

  try {
    const parsedUrl = new URL(value);
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch (error) {
    return false;
  }
}
