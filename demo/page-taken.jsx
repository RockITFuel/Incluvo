// Takenlijst
const { useState: uST } = React;

function Taken() {
  const [tab, setTab] = uST('vandaag');
  const [tasks, setTasks] = uST([
    { id: 1, title: 'Lezen § 4.2 — Aardrijkskunde', sub: 'Cursus Aardrijkskunde · ±15 min', tag: 'Cursus', when: 'vandaag', done: true },
    { id: 2, title: "Inleveren: opdracht 'Mijn buurt'", sub: 'Vandaag 16:00 · met bestand', tag: 'Opdracht', when: 'vandaag', urgent: true },
    { id: 3, title: "Reageer in forum 'Discussie 1'", sub: 'Cursus Maatschappijleer · ±10 min', tag: 'Forum', when: 'vandaag' },
    { id: 4, title: 'Coachplan invullen — vraag 4 t/m 8', sub: 'Met Mira besproken · ±10 min', tag: 'Plan', when: 'vandaag' },
    { id: 5, title: 'Hoofdstuk 5 lezen — Geschiedenis', sub: 'Cursus · vrijdag 9 mei', tag: 'Cursus', when: 'toekomst' },
    { id: 6, title: 'Toets voorbereiden Wiskunde', sub: 'Cursus · maandag 12 mei', tag: 'Cursus', when: 'toekomst' },
    { id: 7, title: 'Project Buurt — eindversie', sub: 'Groepsopdracht · woensdag 14 mei', tag: 'Opdracht', when: 'toekomst', urgent: true },
    { id: 8, title: 'Coachgesprek voorbereiden', sub: 'vrijdag 9 mei · vragen noteren', tag: 'Plan', when: 'toekomst' },
  ]);
  const [adding, setAdding] = uST(false);
  const [newTitle, setNewTitle] = uST('');

  const toggle = id => setTasks(ts => ts.map(t => t.id===id?{...t, done:!t.done}:t));
  const moveToToday = id => setTasks(ts => ts.map(t => t.id===id?{...t, when:'vandaag'}:t));
  const addTask = () => {
    if (!newTitle.trim()) return;
    setTasks(ts => [...ts, { id: Date.now(), title: newTitle, sub: 'Door jou toegevoegd', tag: 'Eigen', when: 'vandaag' }]);
    setNewTitle(''); setAdding(false);
  };

  const today = tasks.filter(t => t.when==='vandaag');
  const future = tasks.filter(t => t.when==='toekomst');
  const totalToday = today.length;
  const doneToday = today.filter(t => t.done).length;
  const pct = totalToday ? (doneToday/totalToday)*100 : 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Mijn taken</h1>
          <div className="sub">Splits per dag — focus op vandaag, zicht op de week.</div>
        </div>
        <div className="row">
          <button className="btn ghost" onClick={()=>setAdding(true)}><Icon name="plus" size={14}/> Taak toevoegen</button>
        </div>
      </div>

      <div className="card" style={{marginBottom:24}}>
        <div className="row between" style={{marginBottom:10}}>
          <div>
            <div style={{fontSize:13, color:'var(--muted)'}}>Voortgang vandaag</div>
            <div style={{fontFamily:'var(--font-head)', fontSize:24, fontWeight:600}}>{doneToday} <span style={{color:'var(--muted)', fontWeight:400, fontSize:18}}>/ {totalToday} klaar</span></div>
          </div>
          <div className="row">
            <span className="chip success"><Icon name="flame" size={14}/> 4 dagen op rij</span>
            <span className="chip">{Math.round(pct)}%</span>
          </div>
        </div>
        <div className="progress success"><span style={{width: pct+'%'}}/></div>
      </div>

      <div className="row" style={{borderBottom:'1px solid var(--line)', marginBottom:20, gap:0}}>
        <TabButton on={tab==='vandaag'} onClick={()=>setTab('vandaag')} count={today.filter(t=>!t.done).length}>Vandaag</TabButton>
        <TabButton on={tab==='toekomst'} onClick={()=>setTab('toekomst')} count={future.length}>Toekomst</TabButton>
        <TabButton on={tab==='klaar'} onClick={()=>setTab('klaar')} count={tasks.filter(t=>t.done).length}>Klaar</TabButton>
      </div>

      {adding && (
        <div className="card" style={{marginBottom:16, borderColor:'var(--primary)', background:'var(--primary-50)'}}>
          <div className="row" style={{gap:8}}>
            <input className="input" autoFocus placeholder="Wat wil je doen?" value={newTitle} onChange={e=>setNewTitle(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addTask()}/>
            <button className="btn primary" onClick={addTask}>Toevoegen</button>
            <button className="btn ghost" onClick={()=>{setAdding(false); setNewTitle('');}}><Icon name="x" size={14}/></button>
          </div>
        </div>
      )}

      {tab === 'vandaag' && (
        <div className="col" style={{gap:8}}>
          {today.map(t => <BigTask key={t.id} t={t} onToggle={()=>toggle(t.id)}/>)}
        </div>
      )}
      {tab === 'toekomst' && (
        <div className="col" style={{gap:24}}>
          <FutureGroup label="Deze week" tasks={future.slice(0,2)} onMove={moveToToday}/>
          <FutureGroup label="Volgende week" tasks={future.slice(2)} onMove={moveToToday}/>
        </div>
      )}
      {tab === 'klaar' && (
        <div className="col" style={{gap:8}}>
          {tasks.filter(t=>t.done).map(t => <BigTask key={t.id} t={t} onToggle={()=>toggle(t.id)}/>)}
          {tasks.filter(t=>t.done).length === 0 && <div style={{padding:32, textAlign:'center', color:'var(--muted)'}}>Nog niets afgevinkt vandaag.</div>}
        </div>
      )}
    </>
  );
}

function TabButton({ on, onClick, children, count }) {
  return (
    <button onClick={onClick} style={{
      padding:'10px 16px', border:0, background:'transparent',
      borderBottom: on?'2px solid var(--primary)':'2px solid transparent',
      color: on?'var(--ink)':'var(--muted)', fontWeight: on?600:500, fontSize:14,
      marginBottom:-1
    }}>
      {children} <span style={{color:'var(--muted)', fontWeight:400, marginLeft:4}}>{count}</span>
    </button>
  );
}

function BigTask({ t, onToggle }) {
  return (
    <div className="row" style={{
      padding:'14px 16px', border:'1px solid var(--line)', borderRadius:12,
      background: t.done?'var(--bg-2)':'var(--surface)', gap:14
    }}>
      <button onClick={onToggle} aria-label="Afvinken" style={{
        width:24, height:24, borderRadius:7, border:'1.5px solid '+(t.done?'var(--success)':'var(--line)'),
        background: t.done?'var(--success)':'transparent', color:'#fff',
        display:'grid', placeItems:'center', flexShrink:0
      }}>{t.done && <Icon name="check" size={15} stroke={2.5}/>}</button>
      <div className="grow" style={{minWidth:0, textDecoration: t.done?'line-through':'none', color: t.done?'var(--muted)':'var(--ink)'}}>
        <div style={{fontWeight:500, fontSize:15}}>{t.title}</div>
        <div style={{fontSize:13, color:'var(--muted)', marginTop:2}}>{t.sub}</div>
      </div>
      {t.urgent && !t.done && <span className="chip danger">Deadline</span>}
      <span className="chip">{t.tag}</span>
    </div>
  );
}

function FutureGroup({ label, tasks, onMove }) {
  return (
    <div>
      <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:10}}>
        <Icon name="calendar" size={14}/>
        <div style={{fontFamily:'var(--font-head)', fontSize:14, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.06em'}}>{label}</div>
      </div>
      <div className="col" style={{gap:8}}>
        {tasks.map(t => (
          <div key={t.id} className="row" style={{padding:'12px 14px', border:'1px solid var(--line)', borderRadius:10, background:'var(--surface)', gap:12}}>
            <Icon name="clock" size={16}/>
            <div className="grow"><div style={{fontWeight:500, fontSize:14}}>{t.title}</div><div style={{fontSize:12, color:'var(--muted)'}}>{t.sub}</div></div>
            {t.urgent && <span className="chip danger">Belangrijk</span>}
            <span className="chip">{t.tag}</span>
            <button className="btn sm subtle" onClick={()=>onMove(t.id)} title="Naar vandaag">+ Vandaag</button>
          </div>
        ))}
      </div>
    </div>
  );
}

window.Taken = Taken;
