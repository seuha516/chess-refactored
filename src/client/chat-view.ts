import type { ChatMessage } from '../shared/protocol.ts';

const MAX_RENDERED = 200;

/** Chat log. Messages are rendered with textContent only, never as HTML. */
export class ChatView {
  readonly #list: HTMLElement;
  readonly #seen = new Set<number>();
  #myId: string | null = null;

  constructor(list: HTMLElement) {
    this.#list = list;
  }

  setMyId(id: string): void {
    this.#myId = id;
  }

  replace(messages: readonly ChatMessage[]): void {
    this.#list.replaceChildren();
    this.#seen.clear();
    for (const message of messages) this.append(message);
  }

  append(message: ChatMessage): void {
    if (this.#seen.has(message.id)) return;
    this.#seen.add(message.id);
    const stick = this.#list.scrollHeight - this.#list.scrollTop - this.#list.clientHeight < 40;

    const item = document.createElement('li');
    if (message.kind === 'system' || !message.author) {
      item.className = 'notice';
      item.textContent = message.text;
    } else if (message.author.id === this.#myId) {
      item.className = 'mine';
      item.textContent = message.text;
    } else {
      item.className = 'other';
      const author = document.createElement('strong');
      const separator = document.createElement('span');
      separator.className = 'visually-hidden';
      separator.textContent = ': ';
      author.append(message.author.name, separator);
      const text = document.createElement('span');
      text.textContent = message.text;
      item.append(author, text);
    }
    item.title = new Date(message.at).toLocaleTimeString();
    this.#list.append(item);
    while (this.#list.childElementCount > MAX_RENDERED) this.#list.firstElementChild?.remove();
    if (stick) this.#list.scrollTop = this.#list.scrollHeight;
  }
}
