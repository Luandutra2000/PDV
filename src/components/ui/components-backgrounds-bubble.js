const DEFAULT_COLORS = {
  first: '18,113,255',
  second: '221,74,255',
  third: '0,220,255',
  fourth: '200,50,50',
  fifth: '180,180,50',
  sixth: '140,100,255'
};

/**
 * Vanilla DOM implementation of the bubble background for the current PDV
 * runtime. It keeps the same public options as the original component while
 * avoiding a React runtime dependency in this application.
 */
export function renderBubbleBackground({ interactive = false, colors = {} } = {}) {
  const palette = { ...DEFAULT_COLORS, ...colors };
  const colorAttributes = Object.entries(palette)
    .map(([name, value]) => `--bubble-${name}: ${value}`)
    .join(';');

  return `
    <div
      class="bubble-background${interactive ? ' bubble-background--interactive' : ''}"
      style="${colorAttributes}"
      aria-hidden="true"
      data-bubble-background
    >
      <div class="bubble-background__glow bubble-background__glow--first"></div>
      <div class="bubble-background__glow bubble-background__glow--second"></div>
      <div class="bubble-background__glow bubble-background__glow--third"></div>
      <div class="bubble-background__glow bubble-background__glow--fourth"></div>
      <div class="bubble-background__glow bubble-background__glow--fifth"></div>
      ${interactive ? '<div class="bubble-background__glow bubble-background__glow--sixth"></div>' : ''}
    </div>
  `;
}

export function bindBubbleBackground(root = document) {
  const background = root.querySelector('[data-bubble-background].bubble-background--interactive');

  if (!background) {
    return () => {};
  }

  const updatePointer = (event) => {
    const rect = background.getBoundingClientRect();
    background.style.setProperty('--bubble-pointer-x', `${event.clientX - rect.left - rect.width / 2}px`);
    background.style.setProperty('--bubble-pointer-y', `${event.clientY - rect.top - rect.height / 2}px`);
  };

  background.addEventListener('pointermove', updatePointer, { passive: true });
  return () => background.removeEventListener('pointermove', updatePointer);
}
