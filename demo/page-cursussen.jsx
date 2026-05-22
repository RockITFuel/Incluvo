// Cursussen view (leerling)
const { useState: uSCu } = React;

function Cursussen() {
  const [open, setOpen] = uSCu(null);
  if (open) return <CursusDetail id={open} onBack={()=>setOpen(null)}/>;
  const cursussen = [
    { id:1, title:'Tekst structureren', subj:'Nederlands', pct:72, color:'primary', last:'§ 4.2 — Inleiding schrijven', tasks:2 },
    { id:2, title:'Breuken & verhoudingen', subj:'Wiskunde', pct:35, color:'accent', last:'Stap 3 van 8', tasks:1 },
    { id:3, title:'Mijn buurt', subj:'Maatschappijleer · groep', pct:60, color:'warning', last:'Inleveren opdracht', tasks:1 },
    { id:4, title:'WO II', subj:'Geschiedenis', pct:15, color:'primary', last:'Podcast aflevering 1', tasks:0 },
  ];
  return (
    <>
      <div className="page-head">
        <div><h1>Cursussen</h1><div className="sub">Jouw cursussen, op jouw manier ingesteld.</div></div>
        <div className="row"><span className="chip">{cursussen.length} actief</span></div>
      </div>
      <div className="grid" style={{gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:16}}>
        {cursussen.map(c => (
          <button key={c.id} onClick={()=>setOpen(c.id)} style={{textAlign:'left', border:0, padding:0, background:'transparent', cursor:'pointer'}}>
            <div className="card" style={{padding:0, overflow:'hidden'}}>
              <div style={{height:96, background: c.color==='primary'?'var(--primary-100)':c.color==='accent'?'var(--accent-100)':'var(--warning-100)', position:'relative', display:'grid', placeItems:'center'}}>
                <Icon name={c.color==='primary'?'page':c.color==='accent'?'flask':'compass'} size={32}/>
                <div className="chip" style={{position:'absolute', top:10, right:10, background:'rgba(255,255,255,0.85)'}}>{c.subj}</div>
              </div>
              <div style={{padding:16}}>
                <h3 style={{fontSize:17, marginBottom:6}}>{c.title}</h3>
                <div style={{fontSize:13, color:'var(--muted)', marginBottom:12}}>Verder waar je stopte: {c.last}</div>
                <div className="progress" style={{marginBottom:8}}><span style={{width:c.pct+'%'}}/></div>
                <div className="row between" style={{fontSize:12, color:'var(--muted)'}}>
                  <span>{c.pct}% afgerond</span>
                  {c.tasks>0 && <span className="chip accent">{c.tasks} taak{c.tasks>1?'en':''}</span>}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

function CursusDetail({ id, onBack }) {
  const sections = [
    { id:1, title:'Week 1 — Wat is een goede tekst?', items: [
      { type:'page', title:'Inleiding van de cursus', meta:'5 min lezen', done:true },
      { type:'video', title:'Hoe schrijf je een goede inleiding?', meta:'6 min', done:true, tag:'Aanbevolen' },
      { type:'opdracht', title:'Mini-opdracht: schrijf 3 inleidingen', meta:'15 min · individueel', done:true },
    ]},
    { id:2, title:'Week 2 — Inleiding & alinea', items: [
      { type:'page', title:'§ 4.2 — Inleiding schrijven', meta:'10 min lezen', done:false, active:true },
      { type:'file', title:'Voorbeelden uit leesboek (PDF)', meta:'PDF · 1.2 MB', done:false },
      { type:'opdracht', title:"Inleveren: opdracht 'Mijn buurt'", meta:'Vandaag 16:00 · met bestand', done:false, urgent:true },
      { type:'forum', title:"Discussie 1 — Wat maakt een tekst overtuigend?", meta:'2 nieuwe reacties', done:false },
    ]},
    { id:3, title:'Week 3 — Argumenten', items: [
      { type:'video', title:'Drie soorten argumenten', meta:'4 min', done:false, locked:true, tag:'Beschikbaar maandag' },
      { type:'opdracht', title:'Schrijf je eigen betoog', meta:'30 min · individueel', done:false, locked:true },
    ]},
  ];
  const total = sections.flatMap(s=>s.items).length;
  const done = sections.flatMap(s=>s.items).filter(i=>i.done).length;
  const pct = (done/total)*100;
  const [hideProgress, setHideProgress] = uSCu(false);
  return (
    <>
      <div className="row" style={{marginBottom:16}}><button className="btn ghost sm" onClick={onBack}><Icon name="arrow-left" size={14}/> Cursussen</button></div>
      <div className="card" style={{padding:0, overflow:'hidden', marginBottom:24}}>
        <div style={{height:140, background:'linear-gradient(135deg, var(--primary), var(--primary-700))', position:'relative', padding:24, color:'#fff', display:'flex', alignItems:'flex-end'}}>
          <div>
            <div style={{fontSize:13, opacity:0.85, marginBottom:6}}>Nederlands · Klas 3B</div>
            <h1 style={{color:'#fff', fontSize:30}}>Tekst structureren</h1>
          </div>
        </div>
        {!hideProgress && (
          <div style={{padding:'16px 24px', borderBottom:'1px solid var(--line)', display:'flex', alignItems:'center', gap:16}}>
            <div className="grow">
              <div className="row between" style={{marginBottom:6, fontSize:13}}><span>Voortgang</span><span style={{color:'var(--muted)'}}>{done} van {total} klaar · {Math.round(pct)}%</span></div>
              <div className="progress success"><span style={{width:pct+'%'}}/></div>
            </div>
            <button className="btn ghost sm" onClick={()=>setHideProgress(true)} title="Voortgang verbergen"><Icon name="eye-off" size={14}/></button>
          </div>
        )}
        <div style={{padding:'14px 24px', background:'var(--bg-2)', display:'flex', alignItems:'center', gap:10, fontSize:13, color:'var(--muted)'}}>
          <Icon name="sparkle" size={14}/>
          Aanbevolen op basis van jouw leervoorkeuren: <strong style={{color:'var(--primary-700)'}}>video & korte stappen</strong>.
          <button style={{marginLeft:'auto', background:'transparent', border:0, color:'var(--primary)', fontWeight:500, fontSize:13, cursor:'pointer'}}>Andere weergave →</button>
        </div>
      </div>
      <div className="col" style={{gap:24}}>
        {sections.map(s => (
          <div key={s.id}>
            <div style={{fontFamily:'var(--font-head)', fontSize:18, fontWeight:600, marginBottom:12}}>{s.title}</div>
            <div className="col" style={{gap:8}}>
              {s.items.map((it, i) => <CbsRow key={i} it={it}/>)}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function CbsRow({ it }) {
  const iconMap = { page:'page', video:'youtube', file:'file', opdracht:'tasks', forum:'forum' };
  const labelMap = { page:'Pagina', video:'Video', file:'Bestand', opdracht:'Opdracht', forum:'Forum' };
  return (
    <div className="row" style={{
      padding:'14px 16px', background: it.active?'var(--primary-50)':'var(--surface)',
      border:'1px solid '+(it.active?'var(--primary)':'var(--line)'), borderRadius:12, gap:14,
      opacity: it.locked?0.55:1, cursor: it.locked?'not-allowed':'pointer'
    }}>
      <div style={{width:36, height:36, borderRadius:10, background:'var(--bg)', display:'grid', placeItems:'center', flexShrink:0, color:'var(--ink-2)'}}>
        <Icon name={iconMap[it.type]} size={18}/>
      </div>
      <div className="grow">
        <div className="row" style={{gap:8, marginBottom:2}}>
          <span style={{fontSize:11, color:'var(--muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em'}}>{labelMap[it.type]}</span>
          {it.tag && <span className="chip primary" style={{fontSize:11}}>{it.tag}</span>}
        </div>
        <div style={{fontWeight:500, fontSize:14.5}}>{it.title}</div>
        <div style={{fontSize:12, color:'var(--muted)', marginTop:2}}>{it.meta}</div>
      </div>
      {it.urgent && <span className="chip danger">Vandaag</span>}
      {it.done ? <span className="chip success"><Icon name="check" size={12}/> Klaar</span> :
       it.active ? <button className="btn primary sm">Verder</button> :
       it.locked ? <Icon name="shield" size={16}/> :
       <Icon name="chevron-right" size={18}/>}
    </div>
  );
}

window.Cursussen = Cursussen;
