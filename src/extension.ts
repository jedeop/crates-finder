import * as vscode from 'vscode';
import nodeFetch from 'node-fetch';
import { groupBy as _groupBy } from 'lodash';

function fetch(url: string) {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  return nodeFetch(url, { headers: { "User-Agent": "crates-completer VSCode Extension https://github.com/jedeop/crates-completer" } });
}

const CARGO_MODE: vscode.DocumentSelector = { language: 'toml', pattern: '**/Cargo.toml' };
const CRATES_IO_SEARCH_URL = 'https://crates.io/api/v1/crates?page=1&per_page=10&q=';
const CRATES_IO_CRATE_URL = (crate: string) => `https://crates.io/api/v1/crates/${crate}`;

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
  let regex = /^\s*\[(.+)\]/ig;
  let line = cursorLine - 1;
  let isInDependencies = false;
  while (line > 0) {
    let attr = regex.exec(document.lineAt(line).text);
    if (attr) {
      isInDependencies = attr[1].includes('dependencies');
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

    if (text.includes('=')) {
      return new vscode.CompletionList();
    }

    const res = await fetch(`${CRATES_IO_SEARCH_URL}${text}`);
    const { crates }: { crates: Crate[] } = await res.json();

    const items = crates.map(crate => {
      const item = new vscode.CompletionItem(crate.name, vscode.CompletionItemKind.Property);
      item.insertText = new vscode.SnippetString(`${crate.name} = "\${1:${crate.max_stable_version}}"`);
      item.detail = `latest: ${crate.max_stable_version}`;
      item.documentation = `${crate.description}`;
      return item;
    });

    return new vscode.CompletionList(items, true);
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

    const getCrate = /^\s*([\w-]+?)\s*=/;
    const isSimple = /^\s*([\w-]+?)\s*=\s*"[^"]*$/;
    const isInlineTable = /version\s*=\s*"[^"]*$/;

    if (!(getCrate.test(text) && (isSimple.test(text) || isInlineTable.test(text)))) {
      return new vscode.CompletionList();
    }


    const crate = (getCrate.exec(text) as RegExpExecArray)[1];

    const res = await fetch(CRATES_IO_CRATE_URL(crate));
    const { crate: crateMeta, versions }: { crate: Crate, versions: CrateVersion[] } = await res.json();

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
        if (version === crateMeta.max_stable_version) {
          item.detail = `latest`;
          item.preselect = true;
        }
        return item;
      });

    return new vscode.CompletionList(items, false);
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
