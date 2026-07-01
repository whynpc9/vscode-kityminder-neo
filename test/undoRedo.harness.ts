import { createDefaultKmDocument, type KmDocumentJson, type KmNodeJson } from '../src/shared/km';
import { MindmapEngine } from '../src/webview/mindmap-engine';

export interface HarnessResult {
  name: string;
  passed: boolean;
  error?: string;
}

function treeShape(node: KmNodeJson): unknown {
  return {
    text: node.data.text,
    note: node.data.note ?? null,
    collapsed: node.data.expandState === 'collapse',
    children: node.children.map(treeShape),
  };
}

function docShape(doc: KmDocumentJson): unknown {
  return {
    template: doc.template ?? 'default',
    theme: doc.theme ?? null,
    root: treeShape(doc.root),
  };
}

function countNodes(node: KmNodeJson): number {
  return 1 + node.children.reduce((sum, child) => sum + countNodes(child), 0);
}

const activeEngines: MindmapEngine[] = [];

function trackEngine(engine: MindmapEngine): MindmapEngine {
  activeEngines.push(engine);
  return engine;
}

function createEngine(): MindmapEngine {
  const container = document.createElement('div');
  container.style.width = '800px';
  container.style.height = '600px';
  document.body.appendChild(container);
  const engine = trackEngine(new MindmapEngine(container));
  engine.importDocument(createDefaultKmDocument('Root'));
  return engine;
}

function assertEqual(actual: unknown, expected: unknown, message: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${message}\n  expected: ${e}\n  actual:   ${a}`);
  }
}

function assertTrue(value: boolean, message: string) {
  if (!value) throw new Error(message);
}

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const tests: TestCase[] = [
  {
    name: 'returns false when undo/redo stacks are empty',
    run() {
      const engine = createEngine();
      assertTrue(engine.undo() === false, 'undo should be false on empty stack');
      assertTrue(engine.redo() === false, 'redo should be false on empty stack');
    },
  },
  {
    name: 'undoes and redoes addChild',
    run() {
      const engine = createEngine();
      const before = docShape(engine.exportDocument());
      engine.addChild('Child A');
      assertEqual(countNodes(engine.exportDocument().root), 2, 'addChild should add one node');
      assertTrue(engine.undo(), 'undo should succeed');
      assertEqual(docShape(engine.exportDocument()), before, 'undo should restore previous document');
      assertTrue(engine.redo(), 'redo should succeed');
      assertEqual(treeShape(engine.exportDocument().root), {
        text: 'Root',
        note: null,
        collapsed: false,
        children: [{ text: 'Child A', note: null, collapsed: false, children: [] }],
      }, 'redo should restore child');
    },
  },
  {
    name: 'undoes and redoes addSibling',
    run() {
      const engine = createEngine();
      engine.addChild('Only child');
      const child = engine.getSelectedNode()!;
      engine.addSibling('Sibling B');
      assertEqual(
        engine.exportDocument().root.children.map((c) => c.data.text),
        ['Only child', 'Sibling B'],
        'sibling order',
      );
      assertTrue(engine.undo(), 'undo addSibling');
      assertEqual(
        engine.exportDocument().root.children.map((c) => c.data.text),
        ['Only child'],
        'undo sibling',
      );
      assertEqual(engine.getSelectedNode()?.id, child.id, 'selection preserved');
      assertTrue(engine.redo(), 'redo addSibling');
    },
  },
  {
    name: 'undoes and redoes addParent',
    run() {
      const engine = createEngine();
      engine.addChild('Leaf');
      const leafId = engine.getSelectedNode()!.id;
      engine.addParent('Wrapper');
      assertEqual(engine.getSelectedNode()?.text, 'Wrapper', 'wrapper selected');
      assertTrue(engine.undo(), 'undo addParent');
      assertEqual(engine.exportDocument().root.children.map((c) => c.data.text), ['Leaf'], 'leaf restored');
      assertEqual(engine.getSelectedNode()?.id, leafId, 'leaf re-selected');
      assertTrue(engine.redo(), 'redo addParent');
    },
  },
  {
    name: 'undoes and redoes removeSelected',
    run() {
      const engine = createEngine();
      engine.addChild('To delete');
      const before = docShape(engine.exportDocument());
      engine.removeSelected();
      assertEqual(countNodes(engine.exportDocument().root), 1, 'node removed');
      assertTrue(engine.undo(), 'undo delete');
      assertEqual(docShape(engine.exportDocument()), before, 'document restored');
      assertTrue(engine.redo(), 'redo delete');
      assertEqual(countNodes(engine.exportDocument().root), 1, 'node removed again');
    },
  },
  {
    name: 'undoes and redoes updateText and updateNote',
    run() {
      const engine = createEngine();
      engine.addChild('Node');
      engine.updateText('Renamed');
      engine.updateNote('note body');
      assertTrue(engine.undo(), 'undo note');
      assertEqual(engine.exportDocument().root.children[0].data.note, undefined, 'note cleared');
      assertTrue(engine.undo(), 'undo rename');
      assertEqual(engine.exportDocument().root.children[0].data.text, 'Node', 'text restored');
      assertTrue(engine.redo(), 'redo rename');
      assertTrue(engine.redo(), 'redo note');
      assertEqual(engine.exportDocument().root.children[0].data.note, 'note body', 'note restored');
    },
  },
  {
    name: 'undoes and redoes moveNodeUp/moveNodeDown',
    run() {
      const engine = createEngine();
      engine.addChild('A');
      engine.addSibling('B');
      engine.addSibling('C');
      engine.selectNode(engine.exportDocument().root.children[2].data.id as string);
      engine.moveNodeUp();
      assertEqual(
        engine.exportDocument().root.children.map((c) => c.data.text),
        ['A', 'C', 'B'],
        'moved up',
      );
      engine.moveNodeDown();
      assertEqual(
        engine.exportDocument().root.children.map((c) => c.data.text),
        ['A', 'B', 'C'],
        'moved down',
      );
      assertTrue(engine.undo(), 'undo move down');
      assertTrue(engine.undo(), 'undo move up');
      assertEqual(
        engine.exportDocument().root.children.map((c) => c.data.text),
        ['A', 'B', 'C'],
        'order restored',
      );
    },
  },
  {
    name: 'undoes and redoes expand/collapse and expandToLevel',
    run() {
      const engine = createEngine();
      engine.addChild('Branch');
      const branchId = engine.getSelectedNode()!.id;
      engine.addChild('Leaf');
      engine.selectNode(branchId);
      engine.collapse();
      assertEqual(engine.exportDocument().root.children[0].data.expandState, 'collapse', 'collapsed');
      assertTrue(engine.undo(), 'undo collapse');
      assertEqual(engine.exportDocument().root.children[0].data.expandState, undefined, 'expanded');
      assertTrue(engine.redo(), 'redo collapse');
      engine.expandAll();
      engine.expandToLevel(1);
      assertEqual(engine.exportDocument().root.children[0].data.expandState, 'collapse', 'level 1');
      assertTrue(engine.undo(), 'undo expandToLevel');
    },
  },
  {
    name: 'undoes and redoes setTemplate',
    run() {
      const engine = createEngine();
      engine.addChild('Child');
      const beforeTemplate = engine.template;
      engine.setTemplate('right');
      assertEqual(engine.template, 'right', 'template changed');
      assertTrue(engine.undo(), 'undo template');
      assertEqual(engine.template, beforeTemplate, 'template restored');
      assertTrue(engine.redo(), 'redo template');
    },
  },
  {
    name: 'clears redo stack after a new edit following undo',
    run() {
      const engine = createEngine();
      engine.addChild('One');
      engine.addChild('Two');
      assertTrue(engine.undo(), 'undo Two');
      assertTrue(engine.redo(), 'redo Two');
      engine.addChild('Three');
      assertTrue(engine.redo() === false, 'redo cleared after new edit');
      assertEqual(
        engine.exportDocument().root.children[0].children[0].children[0].data.text,
        'Three',
        'new edit applies to previously selected node',
      );
    },
  },
  {
    name: 'supports multiple sequential undos and redos',
    run() {
      const engine = createEngine();
      engine.addChild('A');
      engine.addChild('B');
      engine.addChild('C');
      assertTrue(engine.undo(), 'undo C');
      assertTrue(engine.undo(), 'undo B');
      assertEqual(countNodes(engine.exportDocument().root), 2, 'two nodes remain');
      assertTrue(engine.redo(), 'redo B');
      assertTrue(engine.redo(), 'redo C');
      assertEqual(countNodes(engine.exportDocument().root), 4, 'all nodes back');
    },
  },
  {
    name: 'clears history when importDocument is called',
    run() {
      const engine = createEngine();
      engine.addChild('Child');
      assertTrue(engine.undo(), 'undo child');
      engine.importDocument(createDefaultKmDocument('Fresh'));
      assertTrue(engine.undo() === false, 'undo cleared');
      assertTrue(engine.redo() === false, 'redo cleared');
      assertEqual(engine.exportDocument().root.data.text, 'Fresh', 'new document loaded');
    },
  },
  {
    name: 'preserves selected node across undo when it still exists',
    run() {
      const engine = createEngine();
      engine.addChild('Keep me');
      const childId = engine.getSelectedNode()!.id;
      engine.addSibling('Remove me');
      assertTrue(engine.undo(), 'undo sibling add');
      assertEqual(engine.getSelectedNode()?.id, childId, 'selection preserved');
    },
  },
  {
    name: 'restores deleted node and selection on undo',
    run() {
      const engine = createEngine();
      engine.addChild('Gone');
      const goneId = engine.getSelectedNode()!.id;
      const rootId = engine.exportDocument().root.data.id as string;
      engine.removeSelected();
      assertEqual(engine.getSelectedNode()?.id, rootId, 'root selected after delete');
      assertTrue(engine.undo(), 'undo delete');
      assertEqual(engine.getSelectedNode()?.id, goneId, 'deleted node restored and selected');
    },
  },
  {
    name: 'toolbar undo button restores previous edit',
    run() {
      document.body.innerHTML =
        '<div id="host"></div><button id="btn-undo" type="button"></button><button id="btn-redo" type="button"></button>';
      const container = document.createElement('div');
      container.style.width = '800px';
      container.style.height = '600px';
      document.getElementById('host')!.appendChild(container);
      const engine = trackEngine(new MindmapEngine(container));
      engine.importDocument(createDefaultKmDocument('Root'));
      document.getElementById('btn-undo')!.addEventListener('click', () => engine.undo());
      document.getElementById('btn-redo')!.addEventListener('click', () => engine.redo());
      engine.addChild('Before undo button');
      const before = docShape(engine.exportDocument());
      engine.addChild('After undo button');
      (document.getElementById('btn-undo') as HTMLButtonElement).click();
      assertEqual(docShape(engine.exportDocument()), before, 'toolbar undo');
    },
  },
  {
    name: 'toolbar redo button restores undone edit',
    run() {
      document.body.innerHTML =
        '<div id="host"></div><button id="btn-undo" type="button"></button><button id="btn-redo" type="button"></button>';
      const container = document.createElement('div');
      container.style.width = '800px';
      container.style.height = '600px';
      document.getElementById('host')!.appendChild(container);
      const engine = trackEngine(new MindmapEngine(container));
      engine.importDocument(createDefaultKmDocument('Root'));
      document.getElementById('btn-undo')!.addEventListener('click', () => engine.undo());
      document.getElementById('btn-redo')!.addEventListener('click', () => engine.redo());
      engine.addChild('Step 1');
      engine.addChild('Step 2');
      engine.undo();
      (document.getElementById('btn-redo') as HTMLButtonElement).click();
      assertEqual(countNodes(engine.exportDocument().root), 3, 'toolbar redo');
    },
  },
  {
    name: 'keyboard shortcut Cmd+Z triggers undo',
    run() {
      const engine = createEngine();
      window.addEventListener('keydown', (e) => {
        const mod = e.ctrlKey || e.metaKey;
        if (mod && e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          engine.undo();
        }
      }, { once: false });
      engine.addChild('Before shortcut');
      const before = docShape(engine.exportDocument());
      engine.addChild('After shortcut');
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true }),
      );
      assertEqual(docShape(engine.exportDocument()), before, 'Cmd+Z should undo');
    },
  },
  {
    name: 'keyboard shortcut Cmd+Shift+Z triggers redo',
    run() {
      const engine = createEngine();
      window.addEventListener('keydown', (e) => {
        const mod = e.ctrlKey || e.metaKey;
        if (mod && e.key === 'z' && e.shiftKey) {
          e.preventDefault();
          engine.redo();
        }
      }, { once: false });
      engine.addChild('One');
      engine.addChild('Two');
      engine.undo();
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'z', metaKey: true, shiftKey: true, bubbles: true }),
      );
      assertEqual(countNodes(engine.exportDocument().root), 3, 'Cmd+Shift+Z should redo');
    },
  },
  {
    name: 'exports SVG and PNG images with optional background',
    async run() {
      const engine = createEngine();
      engine.addChild('Export Child');
      await new Promise((resolve) => window.setTimeout(resolve, 250));

      const svg = await engine.exportImage({ format: 'svg', backgroundColor: '#ffffff' });
      assertEqual(svg.format, 'svg', 'SVG format');
      assertEqual(svg.encoding, 'utf8', 'SVG encoding');
      assertTrue(svg.data.includes('<svg'), 'SVG markup returned');
      assertTrue(svg.data.includes('data-kityminder-export-background'), 'SVG background inserted');
      assertTrue(svg.data.length > 100, 'SVG data returned');

      const png = await engine.exportImage({ format: 'png', backgroundColor: null });
      assertEqual(png.format, 'png', 'PNG format');
      assertEqual(png.encoding, 'base64', 'PNG encoding');
      assertTrue(png.data.length > 100, 'PNG data returned');
      assertTrue(/^[A-Za-z0-9+/]+=*$/.test(png.data), 'PNG data is base64');
    },
  },
];

export async function runUndoRedoHarness(): Promise<HarnessResult[]> {
  document.body.innerHTML = '';
  const results: HarnessResult[] = [];

  for (const test of tests) {
    try {
      await test.run();
      results.push({ name: test.name, passed: true });
    } catch (error) {
      results.push({
        name: test.name,
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      for (const engine of activeEngines.splice(0)) {
        engine.dispose();
      }
      document.body.innerHTML = '';
    }
  }

  (window as unknown as { __UNDO_REDO_RESULTS__?: HarnessResult[] }).__UNDO_REDO_RESULTS__ = results;
  return results;
}

if (typeof window !== 'undefined') {
  (window as unknown as { runUndoRedoHarness?: typeof runUndoRedoHarness }).runUndoRedoHarness =
    runUndoRedoHarness;
}
