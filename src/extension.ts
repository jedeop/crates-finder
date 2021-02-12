import * as vscode from 'vscode';
import fetch from 'node-fetch';
import { groupBy as _groupBy } from 'lodash';

const CARGO_MODE: vscode.DocumentSelector = { language: 'toml', pattern: '**/Cargo.toml' };
const CRATES_IO_SEARCH_URL = 'https://crates.io/api/v1/crates?page=1&per_page=10&q=';
const CRATES_IO_VERSION_URL = (crate: string) => `https://crates.io/api/v1/crates/${crate}/versions`;

interface Crate {
  name: string,
  // eslint-disable-next-line @typescript-eslint/naming-convention
  max_stable_version: string,
  description: string,
}
interface CrateVersion {
  num: string,
  yanked: boolean,
}

function isInDependencies(document: vscode.TextDocument, cursorLine: number): boolean {
    let regex = /\[(.+)\]/ig;
    let line = cursorLine - 1;
    let isInDependencies = false;
    while (line > 0) {
      let attr = regex.exec(document.lineAt(line).text);
      if (attr) {
        isInDependencies = attr[1] === 'dependencies';
        break;
      }
      line--;
    }
    return isInDependencies;
}
function getTextBeforeCursor(document: vscode.TextDocument, position: vscode.Position): string {
  const range = new vscode.Range(position.line, 0, position.line, position.character);
  return document.getText(range);
}

class CrateNameCompletionItemProvider implements vscode.CompletionItemProvider {
  public async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.CompletionList> {
    if (!isInDependencies(document, position.line)) {
      return new vscode.CompletionList();
    }

    const text = getTextBeforeCursor(document, position);

    if (!text.includes('=')) {
      const res = await fetch(`${CRATES_IO_SEARCH_URL}${text}`);
      const { crates }: { crates: Crate[] } = await res.json();

      const items = crates.map(crate => {
        const item = new vscode.CompletionItem(crate.name, vscode.CompletionItemKind.Property);
        item.insertText = new vscode.SnippetString(`${crate.name} = "\${1:${crate.max_stable_version}}"`);
        return item;
      });

      return new vscode.CompletionList(items, true);
    } else {
      return new vscode.CompletionList();
    }

  }
}
class CrateVersionCompletionItemProvider implements vscode.CompletionItemProvider {
  public async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.CompletionList> {
    if (!isInDependencies(document, position.line)) {
      return new vscode.CompletionList();
    }

    const text = getTextBeforeCursor(document, position);

    const regex = /\s*(.+?)\s*=\s*"/;

    if (text.includes('=')) {
      if (!regex.test(text)) {
        return new vscode.CompletionList();
      }
      const crate = (regex.exec(text) as RegExpExecArray)[1];

      const res = await fetch(CRATES_IO_VERSION_URL(crate));
      const { versions }: { versions: CrateVersion[] } = await res.json();

      const items = versions
        .filter(version => !version.yanked)
        .map(version => version.num)
        .map((version, i) => {
          const item = new vscode.CompletionItem(version, vscode.CompletionItemKind.Constant);
          item.insertText = new vscode.SnippetString(`${version}`);
          item.sortText = i.toLocaleString('en-US', {
            minimumIntegerDigits: 10,
            useGrouping: false,
          });
          console.log(item.sortText);
          return item;
        });

      return new vscode.CompletionList(items, false);
    } else {
      return new vscode.CompletionList();
    }
  }
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(vscode.languages.registerCompletionItemProvider(
    CARGO_MODE,
    new CrateNameCompletionItemProvider(),
  ));
  context.subscriptions.push(vscode.languages.registerCompletionItemProvider(
    CARGO_MODE,
    new CrateVersionCompletionItemProvider(),
  ));
}

export function deactivate() { }
