// Coach pages — dashboard, quickpanel, profiel
const { useState: uSD } = React;

const STUDENTS = [
  { id:1, name:'Sami Jansen', klas:'3B', plan:'Ingevuld', planAt:'2 dagen geleden', last:'Vandaag, 09:14', voortgang:62, attention:false, mood:3 },
  { id:2, name:'Lina Mehmet', klas:'3B', plan:'In behandeling', planAt:'gisteren', last:'Gisteren', voortgang:78, attention:false, mood:4 },
  { id:3, name:'Yara Kuiper', klas:'3B', plan:'Niet ingevuld', planAt:'—', last:'4 dagen geleden', voortgang:24, attention:true, mood:1 },
  { id:4, name:'Daan Visser', klas:'3B', plan:'Ingevuld', planAt:'1 week geleden', last:'Vandaag, 11:02', voortgang:55, attention:false, mood:2 },
  { id:5, name:'Noor el-Amrani', klas:'3B', plan:'Ingevuld', planAt:'3 dagen geleden', last:'Vandaag, 08:33', voortgang:88, attention:false, mood:3 },
  { id:6, name:'Tycho Berg', klas:'3B', plan:'In behandeling', planAt:'2 dagen geleden', last:'Gisteren', voortgang:41, attention:true, mood:1 },
  { id:7, name:'Iris Boer', klas:'3B', plan:'Ingevuld', planAt:'5 dagen geleden', last:'Vandaag, 10:18', voortgang:70, attention:false, mood:3 },
  { id:8, name:'Bilal Younes', klas:'3B', plan:'Ingevuld', planAt:'1 week geleden', last:'2 dagen geleden', voortgang:48, attention:false, mood:2 },
];

const MOOD_EMOJI = ['😞','😕','😐','🙂','😄'];

function CoachDashboard() {
  const [open, setOpen] = uSD(null);
  const [filter, setFilter] = uSD('all');
  const [profile, setProfile] = uSD(null);

  if (profile) return <StudentProfile s={STUDENTS.find(x=>x.id===profile)} onBack={()=>setProfile(null)}/>;

  const filtered = filter==='attention' ? STUDENTS.filter(s=>s.attention) : filter==='plan' ? STUDENTS.filter(s=>s.plan==='In behandeling') : STUDENTS;

  return (
    <>
      <div className="page-head">
        <div><h1>Dashboard</h1><div className="sub">Donderdag 7 mei · 8 leerlingen · Klas 3B</div></div>
        <div className="row">
          <button className="btn ghost"><Icon name="plus" size={14}/> Taak voor klas</button>
          <button className="btn primary"><Icon name="sparkle" size={14}/> AI-overzicht week</button>
        </div>
      </div>
      <div className="grid" style={{gridTemplateColumns:'repeat(4, 1fr)', gap:16, marginBottom:24}}>
        <KPI label="Plannen klaar" value="6/8" sub="2 in behandeling" tone="primary" icon="plan"/>
        <KPI label="Aandacht nodig" value="2" sub="Yara K. · Tycho B." tone="accent" icon="flag"/>
        <KPI label="Inzendingen vandaag" value="14" sub="3 nog te beoordelen" tone="warning" icon="tasks"/>
        <KPI label="Gem. voortgang" value="58%" sub="+4% deze week" tone="success" icon="flame"/>
      </div>
      <div className="row" style={{marginBottom:14, gap:8, flexWrap:'wrap'}}>
        <div className="seg">
          <button className={filter==='all'?'on':''} onClick={()=>setFilter('all')}>Alle leerlingen</button>
          <button className={filter==='attention'?'on':''} onClick={()=>setFilter('attention')}>Aandacht</button>
          <button className={filter==='plan'?'on':''} onClick={()=>setFilter('plan')}>Plan in behandeling</button>
        </div>
        <div className="grow"/>
        <div className="row" style={{gap:8, padding:'7px 12px', background:'var(--surface)', borderRadius:10, border:'1px solid var(--line)'}}>
          <Icon name="search" size={14}/>
          <input style={{border:0, background:'transparent', outline:'none', fontSize:13}} placeholder="Zoek leerling…"/>
        </div>
      </div>
      <div className="card" style={{padding:0, overflow:'hidden'}}>
        <div style={{display:'grid', gridTemplateColumns:'2fr 1fr 1.5fr 1.5fr 1fr 100px', padding:'12px 20px', background:'var(--bg-2)', borderBottom:'1px solid var(--line)', fontSize:12, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.04em'}}>
          <div>Leerling</div><div>Mood</div><div>Coachplan</div><div>Voortgang</div><div>Laatst actief</div><div></div>
        </div>
        {filtered.map(s => (
          <div key={s.id} style={{display:'grid', gridTemplateColumns:'2fr 1fr 1.5fr 1.5fr 1fr 100px', padding:'14px 20px', borderBottom:'1px solid var(--line-2)', alignItems:'center', cursor:'pointer', background: s.id===open?'var(--primary-50)':'transparent'}} onClick={()=>setOpen(s.id)}>
            <div className="row">
              <div className="avatar" style={{width:34, height:34, fontSize:12}}>{s.name.split(' ').map(x=>x[0]).slice(0,2).join('')}</div>
              <div><div style={{fontWeight:500, fontSize:14}}>{s.name}</div><div style={{fontSize:12, color:'var(--muted)'}}>Klas {s.klas}</div></div>
              {s.attention && <span className="chip danger" style={{marginLeft:8, fontSize:11}}><Icon name="flag" size={11}/> Aandacht</span>}
            </div>
            <div style={{fontSize:22}}>{MOOD_EMOJI[s.mood]}</div>
            <div>
              <span className={'chip '+(s.plan==='Ingevuld'?'success':s.plan==='In behandeling'?'warning':'')}>{s.plan}</span>
              <div style={{fontSize:11, color:'var(--muted)', marginTop:3}}>{s.planAt}</div>
            </div>
            <div>
              <div className="progress" style={{marginBottom:4}}><span style={{width:s.voortgang+'%'}}/></div>
              <div style={{fontSize:11, color:'var(--muted)'}}>{s.voortgang}%</div>
            </div>
            <div style={{fontSize:13, color:'var(--muted)'}}>{s.last}</div>
            <div className="row" style={{gap:4, justifyContent:'flex-end'}}>
              <button className="icon-btn" style={{width:30, height:30}} onClick={e=>{e.stopPropagation(); setOpen(s.id);}}><Icon name="chat" size={14}/></button>
              <button className="icon-btn" style={{width:30, height:30}} onClick={e=>{e.stopPropagation(); setProfile(s.id);}}><Icon name="profile" size={14}/></button>
            </div>
          </div>
        ))}
      </div>
      {open && <Quickpanel s={STUDENTS.find(x=>x.id===open)} onClose={()=>setOpen(null)} onProfile={()=>{setProfile(open); setOpen(null);}}/>}
    </>
  );
}

function KPI({ label, value, sub, tone, icon }) {
  const bg = tone==='primary'?'var(--primary-100)':tone==='accent'?'var(--accent-100)':tone==='warning'?'var(--warning-100)':'var(--success-100)';
  const fg = tone==='primary'?'var(--primary-700)':tone==='accent'?'var(--accent-700)':tone==='warning'?'var(--warning)':'var(--success)';
  return (
    <div className="card" style={{padding:18}}>
      <div className="row between" style={{marginBottom:8}}><div style={{fontSize:12, color:'var(--muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em'}}>{label}</div><div style={{width:30, height:30, borderRadius:9, background:bg, color:fg, display:'grid', placeItems:'center'}}><Icon name={icon} size={15}/></div></div>
      <div style={{fontFamily:'var(--font-head)', fontSize:28, fontWeight:600, lineHeight:1}}>{value}</div>
      <div style={{fontSize:12, color:'var(--muted)', marginTop:6}}>{sub}</div>
    </div>
  );
}

function Quickpanel({ s, onClose, onProfile }) {
  return (
    <>
      <div onClick={onClose} style={{position:'fixed', inset:0, background:'rgba(14,42,51,0.35)', zIndex:60}}/>
      <div style={{position:'fixed', top:0, right:0, bottom:0, width:420, maxWidth:'100vw', background:'var(--surface)', boxShadow:'var(--shadow-3)', zIndex:70, display:'flex', flexDirection:'column', overflowY:'auto'}}>
        <div style={{padding:20, borderBottom:'1px solid var(--line)', display:'flex', alignItems:'center', gap:12}}>
          <div className="avatar" style={{width:48, height:48, fontSize:16}}>{s.name.split(' ').map(x=>x[0]).slice(0,2).join('')}</div>
          <div className="grow"><div style={{fontFamily:'var(--font-head)', fontWeight:600, fontSize:18}}>{s.name}</div><div style={{fontSize:13, color:'var(--muted)'}}>Klas {s.klas} · Mood {MOOD_EMOJI[s.mood]}</div></div>
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={15}/></button>
        </div>
        <div style={{padding:20, display:'flex', flexDirection:'column', gap:18, flex:1}}>
          <div>
            <div style={{fontSize:12, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8}}>Leervoorkeuren</div>
            <div className="row" style={{flexWrap:'wrap', gap:6}}>
              <span className="chip primary">Korte video</span>
              <span className="chip primary">Stap-voor-stap</span>
              <span className="chip primary">Stilte</span>
              <span className="chip primary">Tekening / schema</span>
              <span className="chip">Meer tijd</span>
            </div>
          </div>
          <div>
            <div className="row between" style={{marginBottom:8}}><div style={{fontSize:12, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.06em'}}>Open taken</div><div style={{fontSize:12, color:'var(--muted)'}}>3 vandaag</div></div>
            <div className="col" style={{gap:6}}>
              <div style={{padding:'10px 12px', background:'var(--bg-2)', borderRadius:8, fontSize:13}}><Icon name="tasks" size={13}/> &nbsp; Inleveren 'Mijn buurt' <span style={{color:'var(--muted)'}}> · vandaag 16:00</span></div>
              <div style={{padding:'10px 12px', background:'var(--bg-2)', borderRadius:8, fontSize:13}}><Icon name="forum" size={13}/> &nbsp; Forum reactie</div>
              <div style={{padding:'10px 12px', background:'var(--bg-2)', borderRadius:8, fontSize:13}}><Icon name="plan" size={13}/> &nbsp; Coachplan vraag 4–8</div>
            </div>
          </div>
          <div>
            <div style={{fontSize:12, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8}}>Actieve cursussen</div>
            <div className="col" style={{gap:6}}>
              <CourseLine name="Tekst structureren" pct={72}/>
              <CourseLine name="Breuken & verhoudingen" pct={35}/>
              <CourseLine name="Mijn buurt" pct={60}/>
            </div>
          </div>
          <div className="grid" style={{gridTemplateColumns:'1fr 1fr', gap:8}}>
            <button className="btn primary"><Icon name="chat" size={14}/> Bericht</button>
            <button className="btn ghost"><Icon name="plus" size={14}/> Taak aanmaken</button>
          </div>
          <button className="btn ghost" onClick={onProfile} style={{marginTop:'auto'}}>Volledig profiel <Icon name="arrow-right" size={14}/></button>
        </div>
      </div>
    </>
  );
}

function CourseLine({ name, pct }) {
  return (
    <div className="row between" style={{padding:'8px 12px', background:'var(--bg-2)', borderRadius:8, gap:12}}>
      <div style={{fontSize:13, fontWeight:500, flex:1}}>{name}</div>
      <div style={{width:80}}><div className="progress"><span style={{width:pct+'%'}}/></div></div>
      <div style={{fontSize:12, color:'var(--muted)', width:32, textAlign:'right'}}>{pct}%</div>
    </div>
  );
}

function StudentProfile({ s, onBack }) {
  return (
    <>
      <div className="row" style={{marginBottom:16}}><button className="btn ghost sm" onClick={onBack}><Icon name="arrow-left" size={14}/> Dashboard</button></div>
      <div className="card" style={{padding:0, overflow:'hidden', marginBottom:24}}>
        <div style={{height:120, background:'linear-gradient(135deg, var(--primary), #1A8094)'}}/>
        <div style={{padding:'0 24px 24px', marginTop:-40, display:'flex', alignItems:'flex-end', gap:18}}>
          <div className="avatar" style={{width:88, height:88, fontSize:28, border:'4px solid var(--surface)'}}>{s.name.split(' ').map(x=>x[0]).slice(0,2).join('')}</div>
          <div className="grow" style={{paddingBottom:8}}>
            <h1 style={{fontSize:26}}>{s.name}</h1>
            <div style={{fontSize:14, color:'var(--muted)'}}>Klas {s.klas} · VMBO-T · 14 jaar</div>
          </div>
          <div className="row" style={{paddingBottom:8}}>
            <button className="btn ghost sm"><Icon name="chat" size={13}/> Bericht</button>
            <button className="btn primary sm"><Icon name="plan" size={13}/> Open coachplan</button>
          </div>
        </div>
      </div>
      <div className="grid" style={{gridTemplateColumns:'2fr 1fr', gap:24}}>
        <div className="col" style={{gap:24}}>
          <div className="card">
            <div className="card-head"><h3>Coachplan</h3><span className="chip success">Ingevuld · 2 dagen geleden</span></div>
            <div className="col" style={{gap:14}}>
              <Field label="Wat wil Sami leren?" val="Inleidingen schrijven die mensen meenemen in het verhaal."/>
              <Field label="Wanneer leer je goed?" val={['In de ochtend','Op mijn eigen plek','In stilte']}/>
              <Field label="Hoe pak je nieuwe stof aan?" val={['Korte video kijken','Stap-voor-stap lezen']}/>
              <Field label="Bespreken met coach" val="Ik vind groepswerk lastig — kunnen we daar samen naar kijken?" flag/>
            </div>
            <div className="row" style={{marginTop:16, gap:8}}>
              <button className="btn ghost sm"><Icon name="pdf" size={13}/> PDF</button>
              <button className="btn ghost sm"><Icon name="sparkle" size={13}/> AI-advies</button>
              <div className="grow"/>
              <label className="row" style={{gap:8, fontSize:13}}><span className="toggle"><input type="checkbox" defaultChecked/><span className="slider"/></span> Afgestemd met ouders</label>
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h3>Activiteit</h3><span className="chip">Laatste 7 dagen</span></div>
            <ActivityRow icon="check" text="Inleiding inleveroefening klaargemaakt — 8/10" when="Vandaag 09:14" tone="success"/>
            <ActivityRow icon="plan" text="Coachplan ingevuld" when="Dinsdag" tone="primary"/>
            <ActivityRow icon="forum" text="Reactie geplaatst in 'Discussie 1'" when="Maandag"/>
            <ActivityRow icon="tasks" text="Toets Wiskunde — 6.5" when="Vorige week" tone="warning"/>
          </div>
        </div>
        <div className="col" style={{gap:24}}>
          <div className="card">
            <div className="card-head"><h3>Leervoorkeuren</h3></div>
            <div className="row" style={{flexWrap:'wrap', gap:6}}>
              <span className="chip primary">Korte video</span><span className="chip primary">Stap-voor-stap</span><span className="chip primary">Stilte</span><span className="chip primary">Tekening / schema</span><span className="chip">Meer tijd</span>
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h3>Mood deze week</h3></div>
            <div className="row" style={{justifyContent:'space-between'}}>
              {['M','D','W','D','V','Z','Z'].map((d, i) => (
                <div key={i} style={{textAlign:'center'}}>
                  <div style={{fontSize:22, marginBottom:6}}>{MOOD_EMOJI[[3,4,2,3,3,null,null][i] ?? 2] || '–'}</div>
                  <div style={{fontSize:11, color:'var(--muted)'}}>{d}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h3>Ouders</h3></div>
            <div className="row" style={{gap:10}}><div className="avatar" style={{width:34, height:34, fontSize:12}}>FJ</div><div><div style={{fontWeight:500, fontSize:13}}>Fatima Jansen</div><div style={{fontSize:12, color:'var(--muted)'}}>Moeder · gekoppeld</div></div></div>
          </div>
        </div>
      </div>
    </>
  );
}

function Field({ label, val, flag }) {
  return (
    <div>
      <div style={{fontSize:12, color:'var(--muted)', marginBottom:4, fontWeight:500}}>{label} {flag && <span className="chip accent" style={{marginLeft:8, fontSize:10}}><Icon name="flag" size={10}/> Bespreken</span>}</div>
      {Array.isArray(val) ? <div className="row" style={{flexWrap:'wrap', gap:6}}>{val.map(v=><span key={v} className="chip primary">{v}</span>)}</div> : <div style={{fontSize:14}}>{val}</div>}
    </div>
  );
}

function ActivityRow({ icon, text, when, tone }) {
  const bg = tone==='success'?'var(--success-100)':tone==='primary'?'var(--primary-100)':tone==='warning'?'var(--warning-100)':'var(--bg-2)';
  const fg = tone==='success'?'var(--success)':tone==='primary'?'var(--primary-700)':tone==='warning'?'var(--warning)':'var(--ink-2)';
  return (
    <div className="row" style={{padding:'10px 0', borderBottom:'1px solid var(--line-2)', gap:12}}>
      <div style={{width:32, height:32, borderRadius:9, background:bg, color:fg, display:'grid', placeItems:'center', flexShrink:0}}><Icon name={icon} size={15}/></div>
      <div className="grow"><div style={{fontSize:13.5}}>{text}</div><div style={{fontSize:11, color:'var(--muted)'}}>{when}</div></div>
    </div>
  );
}

window.CoachDashboard = CoachDashboard;
