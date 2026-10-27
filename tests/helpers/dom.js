// Small DOM/Canvas test double: run the real controller and real renderers in Node.
// No game logic is duplicated here; assertions exercise existing button handlers.
export function createDocument(html) {
  const elements = new Map();
  class Element {
    constructor(tag = 'div') {
      this.tagName = tag;
      this.children = [];
      this.parentNode = null;
      this.style = {};
      this.disabled = false;
      this.className = '';
      this.value = '';
      this.width = 300;
      this.height = 150;
      this.classList = {
        add: name => { this.className = [...new Set([...this.className.split(' '), name])].join(' '); },
        remove: name => { this.className = this.className.split(' ').filter(x => x !== name).join(' '); },
        contains: name => this.className.split(' ').includes(name),
      };
      this.context = {
        createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
        putImageData: image => { this.lastImage = image; },
        drawImage: source => { this.lastDraw = source.lastImage; },
        clearRect() {},
      };
    }
    set innerHTML(value) {
      this.html = value;
      for (const child of this.children) child.parentNode = null;
      this.children = [];
      for (const match of value.matchAll(/id="([^"]+)"/g)) {
        const child = new Element();
        child.id = match[1];
        elements.set(child.id, child);
        this.appendChild(child);
      }
    }
    get innerHTML() { return this.html || ''; }
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
    removeChild(child) {
      if (child.parentNode !== this) throw new Error('NotFoundError: element is not a child');
      this.children.splice(this.children.indexOf(child), 1);
      child.parentNode = null;
    }
    remove() { this.parentNode?.removeChild(this); }
    querySelector(selector) {
      if (selector.startsWith('#')) return this.children.find(x => x.id === selector.slice(1)) || this.children.map(x => x.querySelector(selector)).find(Boolean) || null;
      return null;
    }
    getContext() { return this.context; }
  }
  const body = new Element('body');
  for (const match of html.matchAll(/<(\w+)[^>]*\bid="([^"]+)"([^>]*)>/g)) {
    const node = new Element(match[1]);
    node.id = match[2];
    node.className = /class="([^"]+)"/.exec(match[0])?.[1] || '';
    node.value = /value="([^"]+)"/.exec(match[0])?.[1] || '';
    elements.set(node.id, node);
    body.appendChild(node);
  }
  return {
    body,
    createElement: tag => new Element(tag),
    getElementById: id => body.querySelector(`#${id}`),
    querySelectorAll: selector => selector === '.screen' ? [...elements.values()].filter(x => x.classList.contains('screen')) : [],
  };
}
