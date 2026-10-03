(function () {
  const V = 'v0.0.45';
  const day = 86400;
  const BASE = Math.floor(Date.UTC(2026, 9, 3, 14, 22, 0) / 1000);
  const CLS = [
    { name: 'atlas', n: 512, ver: '26.05.4', host: 'atlas-ctl1', lat: 3, seed: 11 },
    { name: 'borealis', n: 128, ver: '26.05.2', host: 'borealis-ctl', lat: 9, seed: 29 },
    { name: 'dev', n: 16, ver: '26.05.4', host: 'dev-ctl', lat: 21, seed: 5 },
  ];
  const USERS = [['jdoe', 'ml'], ['chen', 'ml'], ['kpatel', 'ml'], ['alice', 'hep'], ['omar', 'hep'], ['eva', 'astro'], ['hiro', 'astro'], ['bkumar', 'genomics'], ['imani', 'genomics'], ['fwang', 'structbio'], ['lsato', 'structbio'], ['gnovak', 'systems'], ['dlopez', 'chem'], ['mrossi', 'chem']];
  const NAMES = { ml: ['train_llama_8b', 'bert_finetune', 'diffusion_sweep', 'rl_ppo', 'vit_pretrain', 'eval_harness'], hep: ['madgraph_gen', 'geant4_sim', 'root_skim'], astro: ['gadget4_nbody', 'cosmo_mcmc', 'healpix_maps'], genomics: ['gatk_haplotype', 'bwa_align', 'blast_nr', 'nf_rnaseq'], structbio: ['alphafold_batch', 'cryoem_refine', 'relion_3d'], systems: ['ior_bench', 'mpi_allreduce'], chem: ['vasp_relax', 'gromacs_npt', 'cp2k_md', 'orca_dft'] };
  const BYPART = { gpu: ['ml', 'structbio', 'astro'], cpu: ['hep', 'astro', 'genomics', 'chem', 'systems'], bigmem: ['genomics', 'structbio'], debug: ['systems', 'chem', 'ml'] };
  const LIM = { cpu: [60, 240, 720, 1440, 2880], gpu: [240, 720, 1440, 2880], bigmem: [720, 1440, 2880], debug: [15, 30] };
  const REASON_TEXT = {
    Priority: 'Higher-priority jobs are queued ahead of this one in the partition.',
    Resources: 'Waiting for enough free resources on the requested partition.',
    QOSMaxGRESPerUser: 'User has reached the QOS limit on GPUs in use (MaxTRESPerUser gres/gpu=32).',
    AssocGrpGRES: 'The account has reached its GrpTRES GPU limit.',
    Dependency: 'Waiting for a dependency (afterok) to finish.',
    JobHeldUser: 'Held by the user. Release it to make it eligible again.',
    JobHeldAdmin: 'Held by an administrator.',
    ReqNodeNotAvail: 'Required nodes are reserved for maintenance (maint_fw_2610).',
    BeginTime: 'The job has a --begin time in the future.',
  };

  function rng(s) { let a = s >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const N = x => ({ set: x != null, infinite: false, number: x == null ? 0 : x });

  function hl(names) {
    if (!names || !names.length) return '';
    const pres = [...new Set(names.map(n => (n.match(/^[a-z]+/) || [''])[0]))];
    if (pres.length > 1) return pres.map(p => hl(names.filter(n => n.startsWith(p) && /^\d/.test(n.slice(p.length))))).join(',');
    if (names.length === 1) return names[0];
    const m = names.map(n => n.match(/^([a-z]+)(\d+)$/));
    const pre = m[0][1], w = m[0][2].length, p = x => String(x).padStart(w, '0');
    const nums = m.map(x => +x[2]).sort((a, b) => a - b), rs = [];
    let s = nums[0], e = nums[0];
    for (let i = 1; i <= nums.length; i++) { if (nums[i] === e + 1) { e = nums[i]; continue; } rs.push(s === e ? p(s) : p(s) + '-' + p(e)); s = e = nums[i]; }
    return pre + '[' + rs.join(',') + ']';
  }
  function uid(u) { const i = USERS.findIndex(x => x[0] === u); return 20100 + (i < 0 ? 99 : i); }
  function fin(j) {
    j.uid = uid(j.user);
    j.workdir = `/home/${j.user}/${j.name}`;
    j.stdout = `${j.workdir}/slurm-${j.id}.out`;
    j.nodesStr = hl(j.nodeNames);
    j.nodeCount = j.nodeNames.length || j.nodeCount || 1;
    j.tres = `cpu=${j.cpus},mem=${j.mem}G,node=${j.nodeCount},billing=${j.cpus}${j.gpus ? ',gres/gpu=' + j.gpus : ''}`;
    return j;
  }

  function gen(cl) {
    const cfg = CLS.find(c => c.name === cl), r = rng(cfg.seed), now = BASE;
    const pick = a => a[Math.floor(r() * a.length)], ri = (a, b) => a + Math.floor(r() * (b - a + 1));
    const wp = o => { let x = r(), s = 0; for (const k in o) { s += o[k]; if (x < s) return k; } return Object.keys(o)[0]; };
    const pad = (x, w) => String(x).padStart(w, '0');
    const n = cfg.n, rk = n >= 64 ? 32 : 8, nG = Math.round(n * 0.22), nB = Math.max(1, Math.round(n * 0.03)), nC = n - nG - nB, nR = Math.min(32, Math.floor(nC / 8));
    const RS = { DRAIN: ['NHC: ib0 link down', 'Kill task failed', 'ECC errors on DIMM B2', 'NHC: /scratch not mounted', 'GPU XID 79 on gpu3', 'Firmware update pending'], DOWN: ['Not responding', 'Node unexpectedly rebooted', 'PSU failure, ticket #4471'] };
    const nodes = [];
    for (let i = 0; i < n; i++) {
      const kind = i < nC ? 'cpu' : i < nC + nG ? 'gpu' : 'bigmem';
      const idx = kind === 'cpu' ? i + 1 : kind === 'gpu' ? i - nC + 1 : i - nC - nG + 1;
      const name = kind === 'cpu' ? 'cn' + pad(idx, 4) : kind === 'gpu' ? 'gpu' + pad(idx, 3) : 'bm' + pad(idx, 2);
      const cpus = kind === 'bigmem' ? 128 : kind === 'gpu' ? 96 : 64, mem = kind === 'bigmem' ? 2048 : kind === 'gpu' ? 1024 : 512, gpus = kind === 'gpu' ? 8 : 0;
      const gtype = kind === 'gpu' ? (idx <= Math.ceil(nG * 0.66) ? 'h100' : 'a100') : '';
      const state = kind === 'cpu' && idx <= nR ? wp({ ALLOCATED: 0.55, RESERVED: 0.45 }) : wp(kind === 'gpu' ? { ALLOCATED: 0.55, MIXED: 0.3, IDLE: 0.06, DRAIN: 0.05, DOWN: 0.02, COMPLETING: 0.02 } : { ALLOCATED: 0.46, MIXED: 0.3, IDLE: 0.18, DRAIN: 0.03, DOWN: 0.015, COMPLETING: 0.015 });
      const full = state === 'ALLOCATED' || state === 'COMPLETING';
      const ac = full ? cpus : state === 'MIXED' ? Math.max(8, Math.round(cpus * (0.2 + r() * 0.6) / 8) * 8) : 0;
      const ag = !gpus ? 0 : full ? 8 : state === 'MIXED' ? ri(1, 7) : 0;
      nodes.push({ name, kind, idx, rack: 'r' + pad(Math.floor(i / rk) + 1, 2), cpus, mem, gpus, gtype, state, ac, ag,
        load: ac ? +(ac * (0.72 + r() * 0.33)).toFixed(1) : +(r() * 0.6).toFixed(2),
        am: ac ? Math.round(mem * ac / cpus * (0.45 + r() * 0.5)) : 0,
        parts: kind === 'cpu' ? (idx <= 8 ? ['cpu', 'debug'] : ['cpu']) : [kind],
        reason: RS[state] ? pick(RS[state]) : '', reasonBy: RS[state] ? pick(['root', 'slurm', 'ops-mkim']) : '', reasonAt: now - ri(600, day * 2), boot: now - ri(day * 3, day * 60),
        ip: `10.40.${Math.floor(i / 250)}.${(i % 250) + 2}`,
        features: kind === 'gpu' ? ['gpu', gtype, 'nvlink', 'ib-ndr'] : kind === 'bigmem' ? ['bigmem', 'avx512', 'ib-hdr'] : ['avx512', 'ib-hdr', idx % 2 ? 'genoa' : 'milan'], jobs: [] });
    }
    const nodeMap = {}; nodes.forEach(x => nodeMap[x.name] = x);

    let id = 4810211;
    const mk = (partition, state) => {
      const account = pick(BYPART[partition]), user = pick(USERS.filter(u => u[1] === account))[0];
      return { id: (id += ri(1, 9)), name: pick(NAMES[account]), user, account, partition, state, qos: partition === 'gpu' ? 'gpu' : partition === 'debug' ? 'debug' : wp({ normal: 0.72, long: 0.13, high: 0.1, scavenger: 0.05 }), timeLimit: pick(LIM[partition]), priority: ri(12000, 98000), submit: now - ri(300, day * 2), reason: 'None', nodeNames: [], nodeCount: 1, cpus: 0, gpus: 0, mem: 0, gtype: '', restarts: 0, hold: false, array: '' };
    };
    const jobs = [];
    const busy = nodes.filter(x => x.ac > 0);
    let i = 0;
    while (i < busy.length) {
      const n0 = busy[i];
      const part = n0.kind === 'cpu' ? (n0.idx <= 8 && r() < 0.5 ? 'debug' : 'cpu') : n0.kind;
      const k = n0.kind === 'gpu' ? +wp({ 1: 0.45, 2: 0.3, 4: 0.25 }) : n0.kind === 'bigmem' ? 1 : +wp({ 1: 0.35, 2: 0.25, 4: 0.25, 8: 0.15 });
      const grp = [n0];
      while (grp.length < k && busy[i + grp.length] && busy[i + grp.length].kind === n0.kind && busy[i + grp.length].state === n0.state && part !== 'debug') grp.push(busy[i + grp.length]);
      i += grp.length;
      const j = mk(part, n0.state === 'COMPLETING' ? 'COMPLETING' : 'RUNNING');
      const el = Math.floor(r() * j.timeLimit * 60 * 0.97);
      j.start = now - el; j.submit = j.start - ri(30, 7200);
      j.nodeNames = grp.map(x => x.name);
      j.cpus = grp.reduce((s, x) => s + x.ac, 0); j.gpus = grp.reduce((s, x) => s + x.ag, 0); j.mem = grp.reduce((s, x) => s + x.am, 0);
      j.gtype = n0.gtype;
      grp.forEach(x => x.jobs.push(j.id));
      jobs.push(j);
    }
    jobs.filter(j => j.partition === 'cpu' && j.state === 'RUNNING').slice(3, 5).forEach(j => j.state = 'SUSPENDED');
    const nP = Math.round(n * 0.12) + 4;
    for (let k = 0; k < nP; k++) {
      const p = wp({ gpu: 0.45, cpu: 0.38, bigmem: 0.1, debug: 0.07 });
      const j = mk(p, 'PENDING');
      j.reason = wp(p === 'gpu' ? { Resources: 0.32, Priority: 0.28, QOSMaxGRESPerUser: 0.16, AssocGrpGRES: 0.1, Dependency: 0.08, JobHeldUser: 0.06 } : { Priority: 0.42, Resources: 0.18, Dependency: 0.14, ReqNodeNotAvail: 0.1, BeginTime: 0.08, JobHeldUser: 0.08 });
      j.hold = j.reason === 'JobHeldUser';
      j.nodeCount = p === 'gpu' ? pick([1, 1, 2, 4]) : p === 'debug' ? 1 : pick([1, 1, 2, 4, 8]);
      j.cpus = j.nodeCount * (p === 'gpu' ? 48 : p === 'bigmem' ? 128 : 64);
      j.gpus = p === 'gpu' ? j.nodeCount * pick([4, 8]) : 0;
      j.gtype = p === 'gpu' ? 'h100' : '';
      j.mem = j.nodeCount * (p === 'bigmem' ? 1536 : p === 'gpu' ? 512 : 256);
      j.submit = now - ri(120, Math.round(day * 1.5));
      j.start = null;
      if (r() < 0.12) j.array = `[0-${pick([15, 31, 63, 99])}%${pick([4, 8, 10])}]`;
      jobs.push(j);
    }
    const ml = NAMES.ml;
    jobs.filter(j => j.partition === 'gpu' && j.state === 'RUNNING').slice(0, 3).forEach((j, x) => { j.user = 'jdoe'; j.account = 'ml'; j.qos = 'gpu'; j.name = ml[x]; });
    jobs.filter(j => j.partition === 'gpu' && j.state === 'PENDING').slice(0, 2).forEach((j, x) => { j.user = 'jdoe'; j.account = 'ml'; j.name = ml[x + 3]; });
    const reid = (j, nid) => { j.nodeNames.forEach(nm => { const x = nodeMap[nm]; x.jobs = x.jobs.map(v => v === j.id ? nid : v); }); j.id = nid; };
    const ARR = 4809900, HET = 4809960, aN = 64, aT = 8, aDone = 30, aStart = now - Math.round(4.2 * 3600);
    const gpu1 = jobs.filter(j => j.partition === 'gpu' && j.state === 'RUNNING' && j.nodeNames.length === 1 && j.user !== 'jdoe').slice(0, aT);
    gpu1.forEach((j, k) => { reid(j, ARR + 1 + aDone + k); Object.assign(j, { user: 'jdoe', account: 'ml', qos: 'gpu', name: 'hparam_sweep', arrayJobId: ARR, arrayTaskId: aDone + k, arraySize: aN, arrayThrottle: aT, timeLimit: 240, submit: aStart, priority: 54210, start: now - ri(240, 3000) }); });
    const aFrom = aDone + gpu1.length, ap = mk('gpu', 'PENDING');
    Object.assign(ap, { id: ARR, user: 'jdoe', account: 'ml', qos: 'gpu', name: 'hparam_sweep', reason: 'JobArrayTaskLimit', arrayJobId: ARR, arraySize: aN, arrayThrottle: aT, array: `[${aFrom}-${aN - 1}%${aT}]`, arrayPending: [aFrom, aN - 1], timeLimit: 240, submit: aStart, priority: 54210, nodeCount: 1, cpus: 96, gpus: 8, gtype: 'h100', mem: 512, start: null });
    jobs.push(ap);
    const hc = jobs.find(j => j.partition === 'cpu' && j.state === 'RUNNING' && j.nodeNames.length >= 2 && j.arrayJobId == null);
    const hg = jobs.find(j => j.partition === 'gpu' && j.state === 'RUNNING' && j.nodeNames.length === 1 && j.arrayJobId == null && j.user !== 'jdoe');
    if (hc && hg) { const hs = now - 9000; [hc, hg].forEach((j, k) => { reid(j, HET + k); Object.assign(j, { user: 'jdoe', account: 'ml', qos: k ? 'gpu' : 'normal', name: 'coupled_cfd_ml', hetJobId: HET, hetOffset: k, hetSet: `${HET}-${HET + 1}`, start: hs, submit: hs - 1260, timeLimit: 720, priority: 61800 }); }); }
    const runJ = jobs.filter(j => j.state === 'RUNNING');
    jobs.filter(j => j.reason === 'Dependency').forEach(j => { j.dep = 'afterok:' + pick(runJ).id; });
    const myPend = jobs.filter(j => j.user === 'jdoe' && j.state === 'PENDING' && j.arrayJobId == null);
    if (myPend[1] && hc) Object.assign(myPend[1], { reason: 'Dependency', dep: 'afterok:' + HET, name: 'postprocess_fields', hold: false });
    jobs.forEach(fin);

    const hist = [];
    for (let k = 0; k < Math.round(n * 0.3) + 20; k++) {
      const p = wp({ cpu: 0.5, gpu: 0.35, bigmem: 0.08, debug: 0.07 });
      const j = mk(p, wp({ COMPLETED: 0.68, FAILED: 0.1, CANCELLED: 0.09, TIMEOUT: 0.07, OUT_OF_MEMORY: 0.04, NODE_FAIL: 0.02 }));
      const lim = j.timeLimit * 60, el = j.state === 'TIMEOUT' ? lim : Math.floor(lim * (0.05 + r() * 0.85));
      j.end = now - Math.floor(r() * day * 7); j.start = j.end - el; j.submit = j.start - ri(20, 14400);
      j.exit = j.state === 'COMPLETED' ? '0:0' : j.state === 'FAILED' ? pick(['1:0', '2:0', '127:0']) : j.state === 'TIMEOUT' || j.state === 'CANCELLED' ? '0:15' : j.state === 'OUT_OF_MEMORY' ? '0:125' : '0:9';
      j.cpuEff = j.state === 'COMPLETED' ? ri(55, 99) : ri(5, 80); j.memEff = j.state === 'OUT_OF_MEMORY' ? 100 : ri(20, 95);
      const pool = nodes.filter(x => x.parts.includes(p)), cnt = p === 'gpu' ? pick([1, 1, 2, 4]) : p === 'cpu' ? pick([1, 2, 4]) : 1, s0 = ri(0, Math.max(0, pool.length - cnt));
      j.nodeNames = pool.slice(s0, s0 + cnt).map(x => x.name);
      j.cpus = j.nodeNames.length * (p === 'gpu' ? 48 : p === 'bigmem' ? 128 : 64); j.gpus = p === 'gpu' ? j.nodeNames.length * 8 : 0; j.mem = j.nodeNames.length * 256; j.gtype = p === 'gpu' ? 'h100' : '';
      hist.push(j);
    }
    hist.sort((a, b) => b.end - a.end);
    let hid = 4810180; hist.forEach(j => { j.id = (hid -= ri(3, 40)); if (j.id >= 4809890 && j.id <= 4810000) { hid = 4809880; j.id = hid; } fin(j); });
    const gpool = nodes.filter(x => x.kind === 'gpu');
    for (let t = 0; t < aDone && gpool.length; t++) {
      const b = Math.floor(t / aT), st0 = aStart + 120 + b * 3000 + ri(0, 240), state = t === 7 || t === 22 ? 'FAILED' : t === 26 ? 'OUT_OF_MEMORY' : 'COMPLETED';
      const d0 = Math.round(ri(2300, 2800) * (t === 13 ? 1.9 : 1) * (state === 'COMPLETED' ? 1 : 0.35));
      hist.push(fin({ id: ARR + 1 + t, name: 'hparam_sweep', user: 'jdoe', account: 'ml', partition: 'gpu', qos: 'gpu', state, reason: 'None', timeLimit: 240, priority: 54210, submit: aStart, start: st0, end: st0 + d0, exit: state === 'COMPLETED' ? '0:0' : state === 'FAILED' ? '1:0' : '0:125', cpuEff: state === 'COMPLETED' ? ri(70, 92) : ri(20, 50), memEff: state === 'OUT_OF_MEMORY' ? 100 : ri(35, 70), nodeNames: [gpool[(t * 7) % gpool.length].name], nodeCount: 1, cpus: 96, gpus: 8, mem: 512, gtype: 'h100', restarts: 0, hold: false, array: '', arrayJobId: ARR, arrayTaskId: t, arraySize: aN, arrayThrottle: aT }));
    }
    hist.sort((a, b) => b.end - a.end);

    const today0 = now - now % day, kG = Math.min(8, nG);
    const resv = [
      { name: 'hep_campaign', nodes: `cn[0001-${pad(nR, 4)}]`, nodeCount: nR, start: now - 2 * day - 18000, end: now + 2 * day + 10800, flags: ['IGNORE_JOBS'], users: [], accounts: ['hep'] },
      { name: 'gpu_workshop', nodes: hl(nodes.filter(x => x.kind === 'gpu').slice(-kG).map(x => x.name)), nodeCount: kG, start: today0 + day + 9 * 3600, end: today0 + day + 17 * 3600, flags: ['SPEC_NODES'], users: ['@training'], accounts: [] },
      { name: 'maint_fw_2610', nodes: 'ALL', nodeCount: n, start: today0 + 4 * day + 6 * 3600, end: today0 + 4 * day + 14 * 3600, flags: ['MAINT', 'IGNORE_JOBS', 'SPEC_NODES'], users: ['root'], accounts: [] },
      { name: 'debug_daytime', nodes: 'cn[0001-0004]', nodeCount: 4, daily: true, h0: 8, h1: 18, flags: ['DAILY', 'FLEX'], users: [], accounts: ['systems', 'chem'] },
    ];
    const parts = [
      { name: 'cpu', def: true, state: 'UP', maxTime: 2880, defTime: 60, tier: 1, qos: 'normal', maxNodes: 'UNLIMITED' },
      { name: 'gpu', def: false, state: 'UP', maxTime: 2880, defTime: 240, tier: 1, qos: 'gpu', maxNodes: '16' },
      { name: 'bigmem', def: false, state: 'UP', maxTime: 4320, defTime: 240, tier: 1, qos: 'normal', maxNodes: '4' },
      { name: 'debug', def: false, state: 'UP', maxTime: 30, defTime: 15, tier: 2, qos: 'debug', maxNodes: '2' },
    ];
    const accts = [['root', null, 1, '', 'normal', 'normal'], ['physics', 'root', 30, 'cpu=8192', 'normal', 'normal,long,high'], ['hep', 'physics', 60, '', 'normal', 'normal,long'], ['astro', 'physics', 40, 'gres/gpu=64', 'normal', 'normal,gpu,long'], ['bio', 'root', 25, 'cpu=6144', 'normal', 'normal,long'], ['genomics', 'bio', 50, 'mem=40T', 'normal', 'normal,long,scavenger'], ['structbio', 'bio', 50, 'gres/gpu=96', 'gpu', 'normal,gpu'], ['cs', 'root', 35, '', 'normal', 'normal,gpu,high'], ['ml', 'cs', 70, 'gres/gpu=256', 'gpu', 'gpu,high,scavenger'], ['systems', 'cs', 30, 'cpu=1024', 'normal', 'normal,debug'], ['chem', 'root', 10, 'cpu=4096', 'normal', 'normal,long']]
      .map(([name, parent, shares, grp, defQos, qos]) => ({ name, parent, shares, grp, defQos, qos, maxJobs: !parent || parent === 'root' ? '' : String(pick([200, 500, 1000])) }));
    const kids = p => accts.filter(a => a.parent === p);
    const usage = {}; accts.forEach(a => { if (a.parent && !kids(a.name).length) usage[a.name] = Math.round(r() * 9e8 + 5e7); });
    const sumU = x => kids(x).length ? kids(x).reduce((s, k) => s + sumU(k.name), 0) : (usage[x] || 0);
    const tot = sumU('root'), fs = {};
    const ff = (u, nm) => Math.min(1, Math.pow(2, -(u / tot) / Math.max(nm, 1e-9)));
    const walk = (x, norm) => {
      const u = sumU(x); fs[x] = { norm, raw: u, eff: u / tot, f: ff(u, norm) };
      const ks = kids(x), ss = ks.reduce((s, k) => s + k.shares, 0);
      ks.forEach(k => walk(k.name, norm * k.shares / ss));
      const us = USERS.filter(y => y[1] === x);
      const wts = us.map(() => 0.2 + r()), wt = wts.reduce((a, b) => a + b, 0);
      us.forEach((y, q) => { const uu = Math.round((usage[x] || 0) * wts[q] / wt), nn = norm / us.length; fs[y[0] + '@' + x] = { norm: nn, raw: uu, eff: uu / tot, f: ff(uu, nn) }; });
    };
    walk('root', 1);
    const qos = [
      { name: 'normal', prio: 0, preempt: 'scavenger', mode: 'cluster', wall: '2-00:00:00', tresPU: 'cpu=2048', jobsPU: '—', grp: '—', uf: '1.0', flags: '—' },
      { name: 'high', prio: 1000, preempt: 'normal,scavenger', mode: 'REQUEUE', wall: '1-00:00:00', tresPU: 'cpu=512,gres/gpu=16', jobsPU: '10', grp: 'gres/gpu=64', uf: '2.0', flags: 'DenyOnLimit' },
      { name: 'long', prio: 0, preempt: '—', mode: 'cluster', wall: '7-00:00:00', tresPU: 'cpu=512', jobsPU: '20', grp: 'cpu=4096', uf: '1.0', flags: '—' },
      { name: 'gpu', prio: 500, preempt: 'scavenger', mode: 'cluster', wall: '2-00:00:00', tresPU: 'gres/gpu=32', jobsPU: '—', grp: '—', uf: '1.0', flags: '—' },
      { name: 'debug', prio: 2000, preempt: '—', mode: 'cluster', wall: '00:30:00', tresPU: 'node=2', jobsPU: '2', grp: '—', uf: '1.0', flags: '—' },
      { name: 'scavenger', prio: 0, preempt: '—', mode: 'REQUEUE', wall: '1-00:00:00', tresPU: '—', jobsPU: '—', grp: '—', uf: '0.0', flags: 'NoReserve,UsageFactorSafe' },
    ];
    const s = n / 512, sc = x => Math.round(x * s) + 3;
    const diag = { threads: n > 100 ? 11 : 5, agentQ: 0, dbdQ: n > 100 ? 2 : 0, sub: sc(1843), started: sc(1702), completed: sc(1611), canceled: sc(74), failed: sc(39), cycleLast: 3120, cycleMean: 2875, cycleMax: 41200, cpm: 58, depth: sc(118), bfLast: sc(1834220), bfMean: sc(1620000), bfMax: sc(4800000), bfDepth: sc(412), bfTry: sc(642), bfJobs: sc(386),
      rpcs: [['REQUEST_PARTITION_INFO', 48211, 92], ['REQUEST_JOB_INFO', 39102, 1840], ['REQUEST_NODE_INFO', 37733, 402], ['MESSAGE_NODE_REGISTRATION_STATUS', 21540, 61], ['REQUEST_STATS_INFO', 8640, 44], ['REQUEST_SUBMIT_BATCH_JOB', 1843, 2210], ['REQUEST_COMPLETE_BATCH_SCRIPT', 1611, 340], ['REQUEST_KILL_JOB', 74, 512], ['REQUEST_UPDATE_NODE', 12, 820]].map(([a, b, c]) => [a, sc(b), c]),
      users: [['root', 61220, 180], ['slurm', 22410, 95], ['prometheus', 8640, 44], ['jdoe', 5210, 610], ['chen', 4980, 590], ['bkumar', 3011, 720], ['alice', 2280, 540]].map(([a, b, c]) => [a, sc(b), c]) };
    const conf = [
      ['Cluster', [['ClusterName', cl], ['SlurmctldHost', `${cl}-ctl1, ${cl}-ctl2`], ['SlurmUser', 'slurm'], ['AuthType', 'auth/slurm'], ['AuthAltTypes', 'auth/jwt'], ['AuthAltParameters', 'jwt_key=/etc/slurm/jwt_hs256.key'], ['StateSaveLocation', '/var/spool/slurmctld'], ['SlurmctldPort', '6817'], ['SlurmdPort', '6818']]],
      ['Scheduling', [['SchedulerType', 'sched/backfill'], ['SchedulerParameters', 'bf_continue,bf_max_job_test=1000,bf_window=4320,default_queue_depth=200'], ['SelectType', 'select/cons_tres'], ['SelectTypeParameters', 'CR_Core_Memory'], ['PreemptType', 'preempt/qos'], ['PreemptMode', 'REQUEUE'], ['MaxJobCount', '100000'], ['MaxArraySize', '10001']]],
      ['Priority', [['PriorityType', 'priority/multifactor'], ['PriorityDecayHalfLife', '7-00:00:00'], ['PriorityWeightAge', '1000'], ['PriorityWeightFairshare', '10000'], ['PriorityWeightJobSize', '500'], ['PriorityWeightPartition', '1000'], ['PriorityWeightQOS', '2000'], ['PriorityWeightTRES', 'CPU=1000,Mem=200,GRES/gpu=4000'], ['PriorityFlags', 'FAIR_TREE']]],
      ['Accounting', [['AccountingStorageType', 'accounting_storage/slurmdbd'], ['AccountingStorageHost', `${cl}-dbd`], ['AccountingStorageEnforce', 'associations,limits,qos,safe'], ['AccountingStoreFlags', 'job_comment,job_env,job_script'], ['AccountingStorageTRES', 'cpu,mem,energy,node,billing,gres/gpu'], ['JobAcctGatherType', 'jobacct_gather/cgroup'], ['JobAcctGatherFrequency', 'task=30']]],
      ['Nodes & health', [['GresTypes', 'gpu'], ['HealthCheckProgram', '/usr/sbin/nhc'], ['HealthCheckInterval', '300'], ['ReturnToService', '2'], ['SlurmdTimeout', '300'], ['KillWait', '30'], ['ProctrackType', 'proctrack/cgroup'], ['TaskPlugin', 'task/cgroup,task/affinity']]],
    ];
    return { cluster: cl, ver: cfg.ver, nodes, nodeMap, jobs, hist, resv, parts, accts, users: USERS, fs, qos, diag, conf };
  }

  const EP_SRC = `D|slurm|job/{job_id}|Cancel or signal job
D|slurm|jobs/|Send signal to list of jobs
D|slurm|node/{node_name}|Delete node
D|slurm|partition/{partition_name}|Delete partition
D|slurm|reservation/{reservation_name}|Delete a reservation
G|slurm|conf|Dump slurm configuration
G|slurm|diag/|Get diagnostics
G|slurm|job/{job_id}|Get job info
G|slurm|job/{job_id}/requeue|Request job requeue
G|slurm|jobs/|Get list of jobs
G|slurm|jobs/state/|Get list of job states
G|slurm|licenses/|Get license info
G|slurm|node/{node_name}|Get node info
G|slurm|nodes/|Get node(s) info
G|slurm|partition/{partition_name}|Get partition info
G|slurm|partitions/|Get all partition info
G|slurm|ping/|Ping slurmctld
G|slurm|reconfigure/|Request slurmctld reconfigure
G|slurm|reservation/{reservation_name}|Get reservation info
G|slurm|reservations/|Get all reservation info
G|slurm|resources/{job_id}|Get job resource layout
G|slurm|shares|Get fairshare info
P|slurm|job/{job_id}|Update job
P|slurm|job/allocate|Submit allocation without steps
P|slurm|job/submit|Submit new job
P|slurm|jobs/requeue|Requeue list of jobs
P|slurm|new/node/|Create dynamic node
P|slurm|node/{node_name}|Update node properties
P|slurm|nodes/|Batch update node(s)
P|slurm|partitions/|Create or update partitions
P|slurm|reservation|Create or update a reservation
P|slurm|reservations/|Create or update reservations
D|slurmdb|account/{account_name}|Delete account
D|slurmdb|association/|Delete association
D|slurmdb|associations/|Delete associations
D|slurmdb|cluster/{cluster_name}|Delete cluster
D|slurmdb|qos/{qos}|Delete QOS
D|slurmdb|user/{name}|Delete user
D|slurmdb|wckey/{id}|Delete wckey
G|slurmdb|account/{account_name}|Get account info
G|slurmdb|accounts/|Get account list
G|slurmdb|association/|Get association info
G|slurmdb|associations/|Get association list
G|slurmdb|cluster/{cluster_name}|Get cluster info
G|slurmdb|clusters/|Get cluster list
G|slurmdb|conf|Dump slurmdbd configuration
G|slurmdb|config|Dump all configuration information
G|slurmdb|diag/|Get slurmdbd diagnostics
G|slurmdb|instance/|Get instance info
G|slurmdb|instances/|Get instance list
G|slurmdb|job/{job_id}|Get accounting job info
G|slurmdb|jobs/|Get accounting job list
G|slurmdb|ping/|Ping slurmdbd
G|slurmdb|qos/|Get QOS list
G|slurmdb|qos/{qos}|Get QOS info
G|slurmdb|tres/|Get TRES info
G|slurmdb|user/{name}|Get user info
G|slurmdb|users/|Get user list
G|slurmdb|wckey/{id}|Get wckey info
G|slurmdb|wckeys/|Get wckey list
P|slurmdb|accounts/|Add or update accounts
P|slurmdb|accounts_association/|Add accounts with conditional association
P|slurmdb|associations/|Set associations
P|slurmdb|clusters/|Add clusters
P|slurmdb|config|Load all configuration information
P|slurmdb|job/{job_id}|Update accounting job
P|slurmdb|jobs/|Update accounting jobs
P|slurmdb|qos/|Add or update QOS
P|slurmdb|tres/|Add TRES
P|slurmdb|users/|Update users
P|slurmdb|users_association/|Add users with conditional association
P|slurmdb|wckeys/|Add or update wckeys`;
  const EPS = EP_SRC.split('\n').map(l => { const [m, ns, p, d] = l.split('|'); return { m, M: { G: 'GET', P: 'POST', D: 'DELETE' }[m], ns, p, d, key: `${m} ${ns} ${p}` }; });

  function meta(db, ns) {
    return { plugin: { type: `openapi/${ns === 'slurmdb' ? 'slurmdbd' : 'slurmctld'}`, name: `Slurm OpenAPI ${ns === 'slurmdb' ? 'slurmdbd' : 'slurmctld'}`, data_parser: `data_parser/${V}`, accounting_storage: 'accounting_storage/slurmdbd' }, client: { source: '[10.40.2.17]:52344', user: 'jdoe', group: 'jdoe' }, command: [], slurm: { version: { major: db.ver.split('.')[0], minor: db.ver.split('.')[1], micro: db.ver.split('.')[2] }, release: db.ver, cluster: db.cluster } };
  }
  function jobApi(j, db) {
    const per = Math.round(j.gpus / Math.max(1, j.nodeCount));
    return { account: j.account, array_job_id: N(j.arrayJobId ?? 0), array_task_id: N(j.arrayTaskId ?? null), array_max_tasks: N(j.arrayThrottle ?? 0), het_job_id: N(j.hetJobId ?? 0), het_job_offset: N(j.hetOffset ?? null), het_job_id_set: j.hetSet || '', dependency: j.dep || '', accrue_time: N(j.submit), array_task_string: j.array || '', batch_host: j.nodeNames[0] || '', cluster: db.cluster, command: j.workdir + '/run.sh', cpus: N(j.cpus), current_working_directory: j.workdir, end_time: N(j.end || (j.start ? j.start + j.timeLimit * 60 : 0)), exit_code: { status: [j.exit && j.exit !== '0:0' ? 'ERROR' : 'SUCCESS'], return_code: N(+(j.exit || '0:0').split(':')[0]) }, gres_detail: j.gpus && j.start ? [`gpu:${j.gtype}:${per}(IDX:0-${per - 1})`] : [], group_name: j.user, hold: !!j.hold, job_id: j.id, job_state: [j.state], name: j.name, node_count: N(j.nodeCount), nodes: j.nodesStr, partition: j.partition, priority: N(j.priority), qos: j.qos, restart_cnt: j.restarts, standard_error: j.stdout.replace('.out', '.err'), standard_output: j.stdout, start_time: N(j.start || 0), state_reason: j.reason, submit_time: N(j.submit), time_limit: N(j.timeLimit), tres_alloc_str: j.start ? j.tres : '', tres_req_str: j.tres, user_id: j.uid, user_name: j.user };
  }
  function nodeApi(n, db) {
    return { name: n.name, hostname: n.name, address: n.ip, architecture: 'x86_64', state: [n.state], cpus: n.cpus, alloc_cpus: n.ac, alloc_idle_cpus: n.cpus - n.ac, cpu_load: Math.round(n.load * 100), real_memory: n.mem * 1024, alloc_memory: n.am * 1024, free_mem: N(Math.max(0, (n.mem - n.am) * 1024 - 2048)), gres: n.gpus ? `gpu:${n.gtype}:8(S:0-1)` : '', gres_used: n.gpus ? `gpu:${n.gtype}:${n.ag}(IDX:${n.ag ? '0-' + (n.ag - 1) : 'N/A'})` : '', partitions: n.parts, features: n.features, active_features: n.features, reason: n.reason, reason_set_by_user: n.reasonBy, reason_changed_at: N(n.reason ? n.reasonAt : 0), boot_time: N(n.boot), operating_system: 'Linux 5.14.0-503.15.1.el9_5.x86_64', version: db.ver, tres: `cpu=${n.cpus},mem=${n.mem}G,billing=${n.cpus}${n.gpus ? ',gres/gpu=8' : ''}`, tres_used: n.ac ? `cpu=${n.ac},mem=${n.am}G${n.ag ? ',gres/gpu=' + n.ag : ''}` : '' };
  }
  function partApi(p, db) {
    const ns = db.nodes.filter(n => n.parts.includes(p.name));
    return { name: p.name, cluster: db.cluster, nodes: { configured: hl(ns.map(n => n.name)), total: ns.length }, cpus: { total: ns.reduce((s, n) => s + n.cpus, 0) }, partition: { state: [p.state] }, flags: p.def ? ['DEFAULT'] : [], maximums: { time: N(p.maxTime), nodes: p.maxNodes === 'UNLIMITED' ? { set: true, infinite: true, number: 0 } : N(+p.maxNodes) }, defaults: { time: N(p.defTime) }, priority: { tier: p.tier, job_factor: 1 }, qos: { assigned: p.qos, allowed: 'ALL' } };
  }
  function defaultParam(ep, db) {
    const m = (ep.p.match(/\{(\w+)\}/) || [])[1];
    if (!m) return '';
    const run = db.jobs.find(j => j.state === 'RUNNING');
    return { job_id: ep.ns === 'slurmdb' ? String(db.hist[0].id) : String(run ? run.id : db.jobs[0].id), node_name: (db.nodes.find(n => n.kind === 'gpu') || db.nodes[0]).name, partition_name: 'gpu', reservation_name: db.resv[0].name, account_name: 'ml', name: 'jdoe', qos: 'gpu', cluster_name: db.cluster, id: '1' }[m] || '';
  }
  function defaultBody(ep, db) {
    if (ep.m !== 'P') return '';
    const B = {
      'slurm job/submit': { job: { name: 'hello_rest', partition: 'cpu', account: 'ml', tasks: 1, time_limit: N(10), current_working_directory: '/home/jdoe', environment: ['PATH=/usr/bin:/bin'], script: '#!/bin/bash\nsrun hostname' } },
      'slurm job/{job_id}': { time_limit: N(1500), comment: 'extended via sdash' },
      'slurm node/{node_name}': { state: ['DRAIN'], reason: 'maintenance' },
      'slurm nodes/': { node_names: ['gpu001', 'gpu002'], state: ['RESUME'] },
      'slurm partitions/': { partitions: [{ name: 'gpu', partition: { state: ['UP'] } }] },
      'slurm reservation': { name: 'ml_benchmark', node_list: ['gpu[001-004]'], accounts: ['ml'], start_time: N(BASE + day), duration: N(240), flags: ['SPEC_NODES'] },
      'slurmdb qos/': { qos: [{ name: 'gpu', priority: N(600), limits: { max: { tres: { per: { user: [{ type: 'gres', name: 'gpu', count: 32 }] } } } } }] },
      'slurmdb users_association/': { association_condition: { accounts: ['ml'], users: ['newuser'], association: { defaultqos: 'gpu' } }, user: { default: { account: 'ml' } } },
    };
    return JSON.stringify(B[ep.ns + ' ' + ep.p] || {}, null, 2);
  }
  function apiMock(ep, param, db, admin, now) {
    const m = meta(db, ep.ns);
    const ok = o => ({ code: 200, body: Object.assign({ meta: m }, o, { warnings: [], errors: [] }) });
    const err = (code, description, error, num) => ({ code, body: { meta: m, warnings: [], errors: [{ description, error_number: num, error, source: ep.p }] } });
    const userOk = /^(job\/submit|job\/allocate|job\/\{job_id\}|jobs\/)$/.test(ep.p) && ep.ns === 'slurm';
    if (!admin && ep.m !== 'G' && !userOk) return err(403, 'Requires operator or administrator AdminLevel', 'Access/permission denied', 1);
    const k = ep.ns + ' ' + ep.p, live = db.jobs.find(j => String(j.id) === String(param)), past = db.hist.find(j => String(j.id) === String(param));
    if (ep.m === 'D' && ep.p.startsWith('job')) return ok({ status: [{ job_id: N(+param || 0), step_id: 'batch', error: { code: 0, string: '', message: '' }, federation: { sibling: '' } }] });
    if (ep.m === 'P' && k === 'slurm job/submit') return ok({ job_id: Math.max(...db.jobs.map(j => j.id)) + 3, step_id: 'batch', job_submit_user_msg: '' });
    if (ep.m === 'P') return ok({});
    switch (k) {
      case 'slurm jobs/': return ok({ jobs: db.jobs.slice(0, 3).map(j => jobApi(j, db)), last_backfill: N(now - 41), last_update: N(now) });
      case 'slurm job/{job_id}': return live ? ok({ jobs: [jobApi(live, db)], last_backfill: N(now - 41), last_update: N(now) }) : err(404, `Job ${param} not found`, 'Invalid job id specified', 2017);
      case 'slurmdb job/{job_id}': return past ? ok({ jobs: [jobApi(past, db)] }) : err(404, `Job ${param} not found`, 'Invalid job id specified', 2017);
      case 'slurm jobs/state/': return ok({ jobs: db.jobs.slice(0, 6).map(j => ({ job_id: j.id, job_state: [j.state] })) });
      case 'slurm nodes/': return ok({ nodes: db.nodes.slice(0, 2).map(n => nodeApi(n, db)), last_update: N(now) });
      case 'slurm node/{node_name}': { const n = db.nodeMap[param]; return n ? ok({ nodes: [nodeApi(n, db)], last_update: N(now) }) : err(404, `Node ${param} not found`, 'Invalid node name specified', 2013); }
      case 'slurm partitions/': return ok({ partitions: db.parts.map(p => partApi(p, db)), last_update: N(now) });
      case 'slurm partition/{partition_name}': { const p = db.parts.find(x => x.name === param); return p ? ok({ partitions: [partApi(p, db)] }) : err(404, `Partition ${param} not found`, 'Invalid partition name specified', 2004); }
      case 'slurm ping/': return ok({ pings: [{ hostname: db.cluster + '-ctl1', pinged: 'UP', responding: true, latency: 314, mode: 'primary', primary: true }, { hostname: db.cluster + '-ctl2', pinged: 'UP', responding: true, latency: 402, mode: 'backup1', primary: false }] });
      case 'slurmdb ping/': return ok({ pings: [{ hostname: db.cluster + '-dbd', responding: true, latency: 1180, primary: true }] });
      case 'slurm diag/': { const d = db.diag; return ok({ statistics: { server_thread_count: d.threads, agent_queue_size: d.agentQ, dbd_agent_queue_size: d.dbdQ, jobs_submitted: d.sub, jobs_started: d.started, jobs_completed: d.completed, jobs_canceled: d.canceled, jobs_failed: d.failed, schedule_cycle_last: d.cycleLast, schedule_cycle_mean: d.cycleMean, schedule_cycle_max: d.cycleMax, bf_active: false, bf_cycle_last: d.bfLast, bf_last_depth: d.bfDepth, bf_last_depth_try: d.bfTry, bf_backfilled_jobs: d.bfJobs, rpcs_by_message_type: d.rpcs.slice(0, 3).map(([t, c, a], i) => ({ message_type: t, type_id: 2000 + i, count: c, average_time: N(a), total_time: c * a })) } }); }
      case 'slurm reservations/': return ok({ reservations: db.resv.map(r => ({ name: r.name, node_list: r.nodes, node_count: r.nodeCount, flags: r.flags, users: r.users, accounts: r.accounts, start_time: N(r.start || 0), end_time: N(r.end || 0) })) });
      case 'slurm shares': return ok({ shares: { shares: db.accts.slice(0, 4).map(a => ({ name: a.name, parent: a.parent || '', shares: N(a.shares), shares_normalized: N(+db.fs[a.name].norm.toFixed(6)), usage: db.fs[a.name].raw, effective_usage: N(+db.fs[a.name].eff.toFixed(6)), fairshare: { factor: N(+db.fs[a.name].f.toFixed(6)), level: N(1) }, type: ['ASSOCIATION'] })), total_shares: 100 } });
      case 'slurm licenses/': return ok({ licenses: [{ LicenseName: 'matlab', Total: 50, Used: 12, Free: 38, Remote: false }, { LicenseName: 'ansys', Total: 16, Used: 16, Free: 0, Remote: true }], last_update: N(now) });
      case 'slurm conf': return ok({ slurm_conf: Object.fromEntries(db.conf.flatMap(g => g[1]).slice(0, 14)) });
      case 'slurmdb qos/': return ok({ qos: db.qos.map(q => ({ name: q.name, priority: N(q.prio), preempt: { list: q.preempt === '—' ? [] : q.preempt.split(','), mode: [q.mode.toUpperCase()] }, usage_factor: N(+q.uf), flags: q.flags === '—' ? [] : q.flags.split(',') })) });
      case 'slurmdb accounts/': return ok({ accounts: db.accts.map(a => ({ name: a.name, description: a.name, organization: a.parent || 'root', flags: [] })) });
      case 'slurmdb users/': return ok({ users: db.users.slice(0, 5).map(([u, a]) => ({ name: u, default: { account: a, wckey: '' }, administrator_level: [u === 'jdoe' ? 'None' : 'None'], flags: [] })) });
      case 'slurmdb clusters/': return ok({ clusters: CLS.map(c => ({ name: c.name, controller: { host: c.host, port: 6817 }, nodes: '', rpc_version: 11008, tres: [{ type: 'node', count: c.n }] })) });
      case 'slurmdb tres/': return ok({ TRES: [['cpu', '', 1], ['mem', '', 2], ['energy', '', 3], ['node', '', 4], ['billing', '', 5], ['gres', 'gpu', 1001]].map(([type, name, id]) => ({ type, name, id })) });
      case 'slurmdb jobs/': return ok({ jobs: db.hist.slice(0, 2).map(j => jobApi(j, db)) });
      default: return ok({});
    }
  }

  function dispId(j) {
    if (j.arrayJobId != null) return j.arrayPending ? `${j.arrayJobId}_${j.array}` : `${j.arrayJobId}_${j.arrayTaskId}`;
    if (j.hetJobId != null) return `${j.hetJobId}+${j.hetOffset}`;
    return j.array ? `${j.id}_${j.array}` : String(j.id);
  }
  function jobType(j) { return j.arrayJobId != null || j.array ? 'Array' : j.hetJobId != null ? 'Heterogeneous' : 'Batch'; }
  function stepsFor(j, now, comps) {
    if (!j.start) return [];
    const r = rng(j.id * 7 + 3), live = !j.end, end = j.end || now;
    const all = comps ? comps.flatMap(c => c.nodeNames) : j.nodeNames, nn = Math.max(1, all.length);
    const span = live ? Math.max(end - j.start, j.timeLimit * 60 * 0.8) : end - j.start, at = f => j.start + Math.round(span * f);
    const fail = { FAILED: ['FAILED', '1:0'], OUT_OF_MEMORY: ['OUT_OF_MEMORY', '0:125'], NODE_FAIL: ['NODE_FAIL', '0:9'], TIMEOUT: ['CANCELLED', '0:15'], CANCELLED: ['CANCELLED', '0:15'] }[j.state];
    const isGpu = j.gpus > 0, cpn = Math.round(j.cpus / Math.max(1, j.nodeNames.length)), mpn = Math.round(j.mem / Math.max(1, j.nodeNames.length));
    let plan;
    if (comps) plan = [['0', 'cfd_solver', 0.004, 0.97, [0], 1], ['1', 'surrogate_srv', 0.006, 0.97, [1], 1], ['2', 'coupler', 0.012, 0.965, [0, 1], 0]];
    else if (j.arrayJobId != null) plan = [['0', 'train.py --trial ' + j.arrayTaskId, 0.01, 0.985, null, 1]];
    else if (isGpu) plan = [['0', 'prepare_data', 0.005, 0.04, null, 0], ['1', 'torchrun', 0.045, 0.94, null, 1], ['2', 'evaluate', 0.945, 0.985, null, 0]];
    else plan = [['0', 'stage_in', 0.003, 0.03, null, 0], ['1', j.name.split('_')[0], 0.035, 0.95, null, 1], ['2', 'post_process', 0.955, 0.99, null, 0]];
    const out = [], memEff = (j.memEff || (35 + r() * 45)) / 100;
    let stop = false;
    for (const [id, nm, f0, f1, cs, main] of plan) {
      if (stop) break;
      const s0 = at(f0); if (s0 > end) break;
      let e = at(f1), state = 'COMPLETED', exit = '0:0';
      if (live && e > now) { e = null; state = 'RUNNING'; }
      else if (!live && fail && main) { e = end - ri0(r, 5, 40); state = fail[0]; exit = fail[1]; stop = !comps; }
      else if (!live && fail && e > end) { e = end - 5; state = 'CANCELLED'; exit = '0:15'; }
      const nodes = cs ? cs.flatMap(k => comps[k].nodeNames) : main ? j.nodeNames : [j.nodeNames[0]];
      const cpus = cs ? cs.reduce((a, k) => a + (cs.length > 1 ? 1 : comps[k].cpus), 0) * (cs.length > 1 ? 8 : 1) : main ? j.cpus : cpn;
      const el = (e || now) - s0, eff = main && j.cpuEff ? j.cpuEff / 100 : main ? (state === 'COMPLETED' || state === 'RUNNING' ? 0.62 + r() * 0.34 : 0.15 + r() * 0.35) : 0.12 + r() * 0.3;
      const ct = el * cpus * eff;
      out.push({ id, name: nm, start: s0, end: e, state, exit, nodes, tasks: cs && cs.length > 1 ? nodes.length : main ? (isGpu && !cs ? Math.max(1, j.gpus) : cpus) : 1, cpus, cpuTime: ct, user: ct * 0.93, sys: ct * 0.07, eff, maxRss: state === 'OUT_OF_MEMORY' ? mpn : Math.round(mpn * (main ? memEff : 0.04 + r() * 0.12) * 10) / 10, maxRssNode: nodes[Math.floor(r() * nodes.length)], comps: cs });
    }
    const bState = live ? 'RUNNING' : fail ? (fail[0] === 'CANCELLED' ? 'CANCELLED' : 'FAILED') : 'COMPLETED';
    const bt = (end - j.start) * 0.02;
    return [{ id: 'extern', name: 'extern', start: j.start, end: live ? null : end, state: live ? 'RUNNING' : 'COMPLETED', exit: '0:0', nodes: all, tasks: nn, cpus: 0, cpuTime: 0, user: 0, sys: 0, eff: 0, maxRss: 0.01, maxRssNode: all[0], comps: comps ? comps.map((c, k) => k) : null },
      { id: 'batch', name: 'batch', start: j.start, end: live ? null : end, state: bState, exit: fail ? fail[1] : '0:0', nodes: [all[0]], tasks: 1, cpus: cpn, cpuTime: bt, user: bt * 0.8, sys: bt * 0.2, eff: bt / Math.max(1, (end - j.start) * cpn), maxRss: 0.4, maxRssNode: all[0], comps: comps ? [0] : null }, ...out];
  }
  function ri0(r, a, b) { return a + Math.floor(r() * (b - a + 1)); }
  function scriptFor(j, comps) {
    if (comps) return `#!/bin/bash
#SBATCH --job-name=${j.name}
#SBATCH --account=${j.account} --time=${Math.floor(j.timeLimit / 60)}:00:00
#SBATCH --partition=${comps[0].partition} --nodes=${comps[0].nodeNames.length} --ntasks-per-node=64
#SBATCH hetjob
#SBATCH --partition=${comps[1] ? comps[1].partition : 'gpu'} --nodes=1 --gres=gpu:h100:8

module load openmpi/5.0 cuda/12.4
srun --het-group=0 ./cfd_solver case/airfoil.yaml &
srun --het-group=1 python surrogate_srv.py --port 7700 &
srun --het-group=0,1 ./coupler --solver-port 7701 --ml-port 7700
wait`;
    if (j.arrayJobId != null || j.array) return `#!/bin/bash
#SBATCH --job-name=${j.name}
#SBATCH --partition=${j.partition} --qos=${j.qos} --account=${j.account}
#SBATCH --array=0-${(j.arraySize || 64) - 1}%${j.arrayThrottle || 8}
#SBATCH --nodes=1 --gres=gpu:h100:8 --cpus-per-task=96
#SBATCH --time=${Math.floor(j.timeLimit / 60)}:00:00
#SBATCH --output=logs/%x_%A_%a.out

source ~/envs/llm/bin/activate
srun python train.py --trial $SLURM_ARRAY_TASK_ID --config sweeps/lr_wd.yaml`;
    if (j.gpus) return `#!/bin/bash
#SBATCH --job-name=${j.name}
#SBATCH --partition=${j.partition} --qos=${j.qos} --account=${j.account}
#SBATCH --nodes=${j.nodeCount} --gres=gpu:${j.gtype || 'h100'}:${Math.round(j.gpus / Math.max(1, j.nodeCount))}
#SBATCH --time=${Math.floor(j.timeLimit / 60)}:00:00

module load cuda/12.4 nccl/2.21
srun -N1 -n1 python prepare_data.py
srun torchrun --nnodes=$SLURM_NNODES --nproc-per-node=${Math.round(j.gpus / Math.max(1, j.nodeCount))} train.py
srun -N1 -n1 python evaluate.py`;
    return `#!/bin/bash
#SBATCH --job-name=${j.name}
#SBATCH --partition=${j.partition} --qos=${j.qos} --account=${j.account}
#SBATCH --nodes=${j.nodeCount} --ntasks-per-node=${Math.round(j.cpus / Math.max(1, j.nodeCount))}
#SBATCH --time=${Math.floor(j.timeLimit / 60)}:00:00

module load openmpi/5.0
srun -N1 -n1 ./stage_in.sh
srun ./${j.name.split('_')[0]} input.cfg
srun -N1 -n1 ./post_process.sh`;
  }
  function coreMap(j, n) {
    const r = rng(j.id + n.idx * 13), nn = Math.max(1, j.nodeNames.length), live = !j.end;
    const jc = Math.min(n.cpus, Math.round(j.cpus / nn)), oc = live ? Math.max(0, Math.min(n.cpus - jc, n.ac - jc)) : Math.floor(r() * (n.cpus - jc + 1)), o = Math.floor(r() * (oc + 1));
    const lay = (tot, mine, oth, off) => Array.from({ length: tot }, (_, i) => i >= off && i < off + mine ? 'job' : i < off || i < oth + mine ? 'other' : 'free');
    const cores = lay(n.cpus, jc, oc, o), half = n.cpus / 2;
    const jg = n.gpus ? Math.min(n.gpus, Math.round(j.gpus / nn)) : 0, og = n.gpus ? (live ? Math.max(0, Math.min(n.gpus - jg, n.ag - jg)) : Math.floor(r() * (n.gpus - jg + 1))) : 0;
    return { sockets: [cores.slice(0, half), cores.slice(half)], gpus: n.gpus ? lay(n.gpus, jg, og, Math.floor(r() * (og + 1))) : [], jc, jg, oc, og };
  }
  function jobDbApi(j, db, steps, script) {
    const base = jobApi(j, db);
    return Object.assign(base, { script, steps: steps.map(s => ({ step: { id: `${j.id}.${s.id}`, name: s.name }, state: [s.state], nodes: { count: s.nodes.length, range: hl(s.nodes) }, tasks: { count: s.tasks }, time: { start: N(s.start), end: N(s.end || 0), elapsed: Math.round((s.end || BASE) - s.start), user: { seconds: Math.round(s.user) }, system: { seconds: Math.round(s.sys) } }, exit_code: { status: [s.exit === '0:0' ? 'SUCCESS' : 'ERROR'], return_code: N(+s.exit.split(':')[0]), signal: { id: N(+s.exit.split(':')[1]) } }, tres: { allocated: [{ type: 'cpu', count: s.cpus }], requested: { max: [{ type: 'mem', node: s.maxRssNode, count: Math.round(s.maxRss * 1073741824) }] }, consumed: { max: [{ type: 'mem', node: s.maxRssNode, count: Math.round(s.maxRss * 1073741824) }] } } })) });
  }

  window.SDASH = { dispId, jobType, stepsFor, scriptFor, coreMap, jobDbApi, V, BASE, CLS, EPS, REASON_TEXT, gen, hl, fin, uid, N, meta, jobApi, nodeApi, partApi, apiMock, defaultParam, defaultBody };
})();
