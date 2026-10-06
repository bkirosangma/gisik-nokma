import { graphRef, type GraphEdgeKind, type GraphEdgeView, type GraphItemKind, type GraphItemView } from '@gisik-nokma/domain';

/*
 * The owner-approved mockup's sample world, VERBATIM: `WS`, `N`, `PROJ_NODE`, `E` (as tuples) and `PROV`
 * (`knowledge-graph-sigma.html:486-548`), copied by machine. Below them, the converter to the wire shapes.
 */
  const WS={gn:{name:'Gisik Nokma',projects:['Mobile web','Workflows','Design'],members:['pA','pT','pR','pB'],hub:'wgn'},st:{name:'Studio',projects:['Website','Brand'],members:['pA','pT'],hub:'wst'}};
  const N={
    t142:{k:'ticket',key:'GN-142',title:'Move sheet loses its scroll position on phone',state:'In progress',cat:'active',project:'Mobile web',who:'pA',due:'2026-10-04'},
    t118:{k:'ticket',key:'GN-118',title:'Phone pass',state:'In progress',cat:'active',project:'Mobile web',who:'pT'},
    t151:{k:'ticket',key:'GN-151',title:'Restore scroll after Move closes',state:'To do',cat:'open',project:'Mobile web',due:'2026-09-30'},
    t149:{k:'ticket',key:'GN-149',title:'Pin the sheet header while scrolling',state:'Done',cat:'done',project:'Mobile web',who:'pA'},
    t133:{k:'ticket',key:'GN-133',title:'Move sheet: workflows branch',state:'In review',cat:'active',project:'Workflows',who:'pB'},
    t160:{k:'ticket',key:'GN-160',title:'Board column jumps after a drag',state:'To do',cat:'open',project:'Mobile web',due:'2026-10-05'},
    t139:{k:'ticket',key:'GN-139',title:'Sheet scroll resets on iOS Safari',state:'Closed',cat:'done',project:'Mobile web'},
    t120:{k:'ticket',key:'GN-120',title:'Bottom navigation bar',state:'Done',cat:'done',project:'Mobile web'},
    t125:{k:'ticket',key:'GN-125',title:'44 px touch targets',state:'In progress',cat:'active',project:'Mobile web',who:'pT',due:'2026-10-01'},
    t126:{k:'ticket',key:'GN-126',title:'Hit-area audit of the board',state:'To do',cat:'open',project:'Mobile web'},
    t131:{k:'ticket',key:'GN-131',title:'Workflow branch picker',state:'In progress',cat:'active',project:'Workflows',who:'pB'},
    t128:{k:'ticket',key:'GN-128',title:'Workflow editor canvas',state:'In progress',cat:'active',project:'Workflows'},
    t130:{k:'ticket',key:'GN-130',title:'Live drag on the workflow canvas',state:'In review',cat:'active',project:'Workflows',due:'2026-09-27'},
    t157:{k:'ticket',key:'GN-157',title:'Swipe between board columns',state:'To do',cat:'open',project:'Mobile web',who:'pA'},
    t101:{k:'ticket',key:'GN-101',title:'Mobile web launch',state:'In progress',cat:'active',project:'Mobile web'},
    t96:{k:'ticket',key:'GN-96',title:'Install as an app',state:'To do',cat:'open',project:'Mobile web'},
    n1:{k:'note',title:'Phone pass rulings',project:'Mobile web'},
    n2:{k:'note',title:'Scroll restoration: what we tried',project:'Mobile web'},
    n3:{k:'note',title:'Mobile web spec',project:'Mobile web'},
    n4:{k:'note',title:'Board drag measurements',project:'Mobile web'},
    n5:{k:'note',title:'Design tokens',project:'Design'},
    n6:{k:'note',title:'Colour roles',project:'Design'},
    n7:{k:'note',title:'Mobile release checklist',project:'Mobile web'},
    s12:{k:'ticket',key:'ST-12',title:'Pricing page copy',state:'In progress',cat:'active',project:'Website',ws:'st',who:'pA'},
    s15:{k:'ticket',key:'ST-15',title:'Contact form breaks on phone',state:'To do',cat:'open',project:'Website',ws:'st',due:'2026-09-29'},
    sn1:{k:'note',title:'Brand voice',project:'Brand',ws:'st'},
    c1:{k:'concept',name:'Scroll position on phone sheets',status:'confirmed',summary:'Why sheets on phone jump back to the top, and the fixes we tried.',by:'Assistant, for Ama Rangsa',reason:'All of these lose or restore scroll when the sheet remounts.'},
    c2:{k:'concept',name:'drag · column · board',status:'suggested',summary:'',by:'the model',reason:'These 4 items sit close together by meaning. Name it, or reject it.'},
    wgn:{k:'workspace',name:'Gisik Nokma',ws:'gn'}, wst:{k:'workspace',name:'Studio',ws:'st'},
    j_mw:{k:'project',name:'Mobile web',ws:'gn',project:'Mobile web'}, j_wf:{k:'project',name:'Workflows',ws:'gn',project:'Workflows'}, j_ds:{k:'project',name:'Design',ws:'gn',project:'Design'},
    j_web:{k:'project',name:'Website',ws:'st',project:'Website'}, j_br:{k:'project',name:'Brand',ws:'st',project:'Brand'},
    pA:{k:'person',name:'Ama Rangsa',ini:'AR'},
    pT:{k:'person',name:'Tengsrang Marak',ini:'TM'},
    pR:{k:'person',name:'Rikseng Sangma',ini:'RS'},
    pB:{k:'person',name:'Bolsrang Momin',ini:'BM'}
  };
  const PROJ_NODE={'gn|Mobile web':'j_mw','gn|Workflows':'j_wf','gn|Design':'j_ds','st|Website':'j_web','st|Brand':'j_br'};
  const E=[
    ['parent','t118','t142'],['parent','t142','t151'],['parent','t142','t149'],['parent','t118','t120'],['parent','t118','t125'],
    ['parent','t125','t126'],['parent','t131','t133'],['parent','t101','t96'],['parent','t128','t130'],
    ['blocks','t133','t142'],['blocks','t126','t125'],
    ['relates','t142','t160'],['relates','t131','t128'],['relates','s15','s12'],
    ['duplicates','t139','t142'],
    ['attached','n1','t142'],['attached','n3','t101'],
    ['ref','n2','t142','Restoring from sessionStorage fought the sheet remount, so the fix moved to [[GN-142]].'],
    ['ref','n1','n3','These rulings extend section 4 of [[Mobile web spec]].'],
    ['ref','n4','t160','Drag cost after the fix is tracked in [[GN-160]].'],
    ['ref','n3','n5','Spacing and colour come from [[Design tokens]].'],
    ['ref','n5','n6','Every colour resolves through [[Colour roles]].'],
    ['ref','t125','n1','Targets follow rule P3 in [[Phone pass rulings]]: 44 px minimum, measured on the hit area.'],
    ['ref','n7','n1','Every row in [[Phone pass rulings]] has a ticket before we cut the release.'],
    ['ref','sn1','s12','Headlines on [[ST-12]] follow this voice.'],
    ['mention','t142','pT'],['mention','n1','pR'],['mention','n2','pA'],['mention','s15','pT'],
    ['assignee','t142','pA'],['assignee','t157','pA'],['assignee','t131','pB'],['assignee','s12','pA'],
    ['tag','c1','t142'],['tag','c1','t151'],['tag','c1','t139'],['tag','c1','n2'],
    ['tag','c2','t160',null,1],['tag','c2','n4',null,1],['tag','c2','t157',null,1],['tag','c2','t130',null,1]
  ];
  const PROV={'blocks t133 t142':['Bolsrang Momin','1 Oct'],'blocks t126 t125':['Tengsrang Marak','26 Sep'],'relates t142 t160':['Ama Rangsa','2 Oct'],'relates t131 t128':['Bolsrang Momin','20 Sep'],
    'relates s15 s12':['Ama Rangsa','28 Sep'],'duplicates t139 t142':['Ama Rangsa','30 Sep'],'attached n1 t142':['Rikseng Sangma','29 Sep'],'attached n3 t101':['Tengsrang Marak','12 Sep']};

type Raw = Record<string, string | undefined> & { k: GraphItemKind };
const NODES = N as unknown as Record<string, Raw>;
const WORKSPACES = WS as Record<string, { hub: string }>;
const PROJECTS = PROJ_NODE as Record<string, string>;
const wsOf = (n: Raw) => n['ws'] ?? 'gn'; // `:525`: every non-person defaults to 'gn'
const kindOf = (id: string): GraphItemKind => NODES[id]!.k;
const ref = (id: string) => graphRef(kindOf(id), id);
/** The project ITEM's id (`PROJ_NODE`, `:526`), e.g. 'gn|Mobile web' → 'j_mw'. */
const projectOf = (n: Raw): string | null => PROJECTS[`${wsOf(n)}|${n['project']}`] ?? null;

/** Titles a test may replace (27.282's 200-character title); read by `fixtureItems`. */
export const titleOverride = new Map<string, string>();

export function fixtureItems(): GraphItemView[] {
  return Object.entries(NODES).map(([id, n]) => {
    const kind = n.k;
    const title = titleOverride.get(ref(id)) ?? n['title'] ?? null;
    return {
      ref: ref(id),
      kind,
      id,
      workspaceId: kind === 'person' ? null : wsOf(n),
      projectId: kind === 'ticket' || kind === 'note' || kind === 'project' ? projectOf(n) : null,
      label: kind === 'ticket' ? n['key']! : kind === 'note' ? title! : n['name']!,
      title: kind === 'ticket' || kind === 'note' ? title : null,
      // the domain has no `done` category (`packages/domain/src/workflow.ts:4`); the mockup's `--cat-done` is `categoryTerminal`
      category: kind === 'ticket' ? (n['cat'] === 'done' ? 'terminal' : (n['cat'] as 'open' | 'active')) : null,
      hop: 0,
      out: false,
      suggested: kind === 'concept' && n['status'] === 'suggested',
    };
  });
}

const ISO: Record<string, string> = { '1 Oct': '2026-10-01', '2 Oct': '2026-10-02', '26 Sep': '2026-09-26', '20 Sep': '2026-09-20', '28 Sep': '2026-09-28', '30 Sep': '2026-09-30', '29 Sep': '2026-09-29', '12 Sep': '2026-09-12', '24 Sep': '2026-09-24' };
type RawEdge = { kind: GraphEdgeKind; a: string; b: string; snip: string | null; sug: boolean; by?: string; at?: string };

/** `E` with `PROV` applied (`:549`) and the generated containment edges (`:550-551`), as wire edges. */
export function fixtureEdges(): GraphEdgeView[] {
  const rows: RawEdge[] = (E as unknown as [GraphEdgeKind, string, string, string?, number?][]).map(([kind, a, b, snip, sug]) => ({ kind, a, b, snip: snip ?? null, sug: !!sug }));
  for (const e of rows) {
    const pv = (PROV as unknown as Record<string, [string, string]>)[`${e.kind} ${e.a} ${e.b}`];
    if (pv) [e.by, e.at] = pv;
    if (e.kind === 'parent') [e.by, e.at] = ['Tengsrang Marak', '24 Sep'];
  }
  for (const [id, n] of Object.entries(NODES)) {
    if (n.k === 'project') rows.push({ kind: 'in', a: WORKSPACES[wsOf(n)]!.hub, b: id, snip: null, sug: false });
    else if ((n.k === 'ticket' || n.k === 'note') && projectOf(n) !== null) rows.push({ kind: 'in', a: projectOf(n)!, b: id, snip: null, sug: false });
  }
  return rows.map((e) => {
    // an assignee row is FLIPPED to person → ticket (spec §2.1; the mockup stores ticket → person)
    const [a, b] = e.kind === 'assignee' ? [e.b, e.a] : [e.a, e.b];
    const from = ref(a), to = ref(b);
    return {
      id: `${e.kind}|${from}|${to}`,
      kind: e.kind,
      from,
      to,
      snippet: e.snip,
      addedBy: e.kind === 'parent' ? null : e.by ?? null,
      addedAt: e.at && e.kind !== 'parent' ? `${ISO[e.at]}T05:00:00.000Z` : null,
      origin: e.kind === 'relates' && a === 't142' && b === 't160' ? 'mcp' : e.by ? 'web' : null, // one "via an assistant" edge for 27.33x
      suggested: e.sug,
    };
  });
}
