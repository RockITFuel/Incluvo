// Coach: coachplan invullen + cursusbouwer
const { useState: uSV } = React;

const COACH_QS = [
  { theme:'Beeld van de leerling', q:'Wat is je algemene beeld van Sami op dit moment?', mapped:true },
  { theme:'Beeld van de leerling', q:'Welke sterke kanten zie je?', mapped:false },
  { theme:'Leervoorkeuren', q:'Welke leervoorkeuren bevestig je samen met de leerling?', type:'tags', mapped:true },
  { theme:'Aandachtspunten', q:'Wat moet aandacht krijgen de komende periode?', mapped:false },
  { theme:'Aandachtspunten', q:'Welke afspraken maken jullie?', mapped:false },
  { theme:'Plan', q:'Welke interventies of cursussen ga je inzetten?', mapped:true },
];

function CoachplanVul() {
  const [step, setStep] = uSV(0);
  const [transcribing, setTranscribing] = uSV(false);
  const [transcript, setTranscript] = uSV('');
  const total = COACH_QS.length;
  const q = COACH_QS[step];

  const startTrans = () => { setTranscribing(true); setTimeout(()=>{ setTranscript('Sami vertelt dat het schrijven beter gaat. Vooral de inleiding voelt sterker. Hij wil graag in stilte werken en korte video\'s zien.'); setTranscribing(false); }, 1800); };

  return (
    <>
      <div className="row" style={{marginBottom:14}}>
        <div className="row" style={{gap:10}}>
          <div className="avatar" style={{width:32, height:32, fontSize:11}}>SJ</div>
          <div><div style={{fontWeight:600, fontSize:14}}>Coachplan · Sami Jansen</div><div style={{fontSize:12, color:'var(--muted)'}}>Klas 3B · Bron: leerlingvragenlijst van 2 dagen geleden</div></div>
        </div>
        <div className="grow"/>
        <button className="btn ghost sm"><Icon name="pdf" size={13}/> PDF genereren</button>
        <button className="btn primary sm">Aanbieden aan leerling <Icon name="send" size={13}/></button>
      </div>
      <div className="grid" style={{gridTemplateColumns:'2fr 1fr', gap:24}}>
        <div className="col" style={{gap:16}}>
          <div className="row between">
            <div className="row" style={{gap:8}}>
              <span className="chip primary">{q.theme}</span>
              <span className="chip">Vraag {step+1} van {total}</span>
              {q.mapped && <span className="chip success"><Icon name="sparkle" size={11}/> Gemapt vanuit leerling</span>}
            </div>
            <div className="row" style={{gap:6}}>
              <button className="btn ghost sm" disabled={step===0} onClick={()=>setStep(step-1)}><Icon name="arrow-left" size={13}/></button>
              <button className="btn ghost sm" disabled={step===total-1} onClick={()=>setStep(step+1)}><Icon name="arrow-right" size={13}/></button>
            </div>
          </div>
          <div className="card">
            <h2 style={{fontSize:22, marginBottom:8, textWrap:'balance'}}>{q.q}</h2>
            {q.mapped && (
              <div style={{padding:'10px 14px', background:'var(--primary-50)', border:'1px solid var(--primary-100)', borderRadius:10, marginBottom:14, fontSize:13}}>
                <div style={{fontSize:11, fontWeight:600, color:'var(--primary-700)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4}}>Antwoord leerling</div>
                {q.type==='tags' ? <div className="row" style={{flexWrap:'wrap', gap:6}}><span className="chip primary">Korte video</span><span className="chip primary">Stap-voor-stap</span><span className="chip primary">Stilte</span><span className="chip primary">Tekening</span></div> : <div>"Het gaat best goed, alleen de inleiding vond ik moeilijk maar het lukte uiteindelijk wel. Ik werk liever in stilte."</div>}
              </div>
            )}
            {q.type==='tags' ? (
              <div className="row" style={{flexWrap:'wrap', gap:8}}>
                {['Korte video','Stap-voor-stap','Stilte','Tekening / schema','Met iemand bespreken','Meer tijd','In de ochtend','Op eigen plek','Pauzes','Voorbeeld erbij'].map(t => {
                  const on = ['Korte video','Stap-voor-stap','Stilte','Tekening / schema'].includes(t);
                  return <button key={t} className={'chip '+(on?'primary':'outline')} style={{padding:'8px 14px', fontSize:13, cursor:'pointer'}}>{on && <Icon name="check" size={12}/>} {t}</button>;
                })}
              </div>
            ) : (
              <textarea className="textarea" style={{minHeight:140, fontSize:14}} placeholder="Schrijf hier je observatie. Antwoorden worden tussentijds opgeslagen." defaultValue={q.mapped ? "Sami werkt rustig en geconcentreerd, vooral in de ochtend. De inleiding-opdracht heeft duidelijk effect gehad — meer zelfvertrouwen merkbaar." : ""}/>
            )}
          </div>
          <div className="row between">
            <button className="btn ghost"><Icon name="archive" size={14}/> Tussentijds opslaan</button>
            <div className="row">
              <label className="row" style={{gap:8, fontSize:13}}><span className="toggle"><input type="checkbox" defaultChecked/><span className="slider"/></span> Afgestemd met ouders</label>
            </div>
          </div>
        </div>
        <div className="col" style={{gap:16}}>
          <div className="card" style={{borderColor: transcribing?'var(--accent)':'var(--line)'}}>
            <div className="card-head"><h3 style={{fontSize:15}}>Transcriptietool</h3><span className="chip">Beta</span></div>
            <div style={{fontSize:13, color:'var(--muted)', marginBottom:12}}>Neem het gesprek op. AI vult de juiste velden in (Incluvo-vragenlijst).</div>
            <div className="col" style={{gap:8}}>
              <button className="btn primary" onClick={startTrans} disabled={transcribing}><Icon name="mic" size={14}/> {transcribing?'Bezig met transcriberen…':'Start opname'}</button>
              <button className="btn ghost"><Icon name="video" size={14}/> Importeer Teams/Zoom</button>
            </div>
            {transcript && (
              <div style={{marginTop:14, padding:'10px 12px', background:'var(--bg-2)', borderRadius:10, fontSize:13, fontStyle:'italic', borderLeft:'3px solid var(--accent)'}}>"{transcript}"</div>
            )}
          </div>
          <div className="card">
            <div className="card-head"><h3 style={{fontSize:15}}>AI-advies</h3><span className="chip primary"><Icon name="sparkle" size={11}/> Wens</span></div>
            <div style={{fontSize:13, color:'var(--muted)', marginBottom:12}}>Op basis van plan + leervoorkeuren.</div>
            <div className="col" style={{gap:8}}>
              <Suggest title="Sami koppelen aan cursus 'Schrijven met structuur'" reason="Past bij leervoorkeur stap-voor-stap"/>
              <Suggest title="Mini-doel: 1 inleiding per week"/>
              <Suggest title="Mentormoment over groepswerk inplannen" warn/>
            </div>
            <button className="btn ghost sm" style={{marginTop:10, width:'100%'}}>Meer adviezen</button>
          </div>
          <div className="card">
            <div className="card-head"><h3 style={{fontSize:15}}>Voortgang plan</h3></div>
            <div className="progress" style={{marginBottom:8}}><span style={{width:((step+1)/total*100)+'%'}}/></div>
            <div style={{fontSize:12, color:'var(--muted)'}}>{step+1} van {total} vragen ingevuld</div>
          </div>
        </div>
      </div>
    </>
  );
}

function Suggest({ title, reason, warn }) {
  return (
    <div style={{padding:'10px 12px', background: warn?'var(--warning-100)':'var(--bg-2)', borderRadius:10, fontSize:13}}>
      <div style={{fontWeight:500, marginBottom:reason?2:0}}>{title}</div>
      {reason && <div style={{fontSize:11, color:'var(--muted)'}}>{reason}</div>}
    </div>
  );
}

// Cursusbouwer
function Cursusbouwer() {
  const [sections, setSections] = uSV([
    { id:1, title:'Week 1 — Wat is een goede tekst?', open:true, items: [
      { id:'a', type:'page', title:'Inleiding van de cursus' },
      { id:'b', type:'video', title:'Hoe schrijf je een goede inleiding?', tags:['Korte video','Stilte'] },
      { id:'c', type:'opdracht', title:'Mini-opdracht: schrijf 3 inleidingen' },
    ]},
    { id:2, title:'Week 2 — Inleiding & alinea', open:true, items: [
      { id:'d', type:'page', title:'§ 4.2 — Inleiding schrijven' },
      { id:'e', type:'file', title:'Voorbeelden uit leesboek (PDF)' },
      { id:'f', type:'opdracht', title:"Inleveren: 'Mijn buurt'", tags:['Stap-voor-stap'] },
      { id:'g', type:'forum', title:"Discussie 1 — Wat maakt een tekst overtuigend?" },
    ]},
    { id:3, title:'Week 3 — Argumenten', open:false, items: [
      { id:'h', type:'video', title:'Drie soorten argumenten' },
      { id:'i', type:'opdracht', title:'Schrijf je eigen betoog' },
    ]},
  ]);
  const toggle = id => setSections(ss => ss.map(s => s.id===id?{...s, open:!s.open}:s));
  const iconMap = { page:'page', video:'youtube', file:'file', opdracht:'tasks', forum:'forum', lti:'compass' };

  return (
    <>
      <div className="page-head">
        <div><h1>Cursusbouwer</h1><div className="sub">Tekst structureren · School template · Bron: Ondivera Sjabloon</div></div>
        <div className="row">
          <span className="chip"><Icon name="eye" size={12}/> Voorvertoning</span>
          <button className="btn ghost"><Icon name="archive" size={14}/> Sjabloon kopiëren</button>
          <button className="btn primary"><Icon name="check" size={14}/> Publiceren</button>
        </div>
      </div>
      <div className="grid" style={{gridTemplateColumns:'1fr 280px', gap:24}}>
        <div className="col" style={{gap:16}}>
          {sections.map(s => (
            <div key={s.id} className="card" style={{padding:0, overflow:'hidden'}}>
              <div className="row" style={{padding:'14px 18px', background:'var(--bg-2)', borderBottom: s.open?'1px solid var(--line)':'none', gap:10}}>
                <Icon name="drag" size={16}/>
                <button onClick={()=>toggle(s.id)} style={{border:0, background:'transparent', padding:0, cursor:'pointer', display:'flex', alignItems:'center', gap:8, flex:1, textAlign:'left'}}>
                  <Icon name={s.open?'chevron-down':'chevron-right'} size={16}/>
                  <div style={{fontFamily:'var(--font-head)', fontWeight:600, fontSize:16}}>{s.title}</div>
                  <span className="chip" style={{marginLeft:8, fontSize:11}}>{s.items.length} items</span>
                </button>
                <button className="icon-btn" style={{width:30, height:30}}><Icon name="edit" size={13}/></button>
                <button className="icon-btn" style={{width:30, height:30}}><Icon name="eye" size={13}/></button>
                <button className="icon-btn" style={{width:30, height:30}}><Icon name="trash" size={13}/></button>
              </div>
              {s.open && (
                <div style={{padding:14, display:'flex', flexDirection:'column', gap:8}}>
                  {s.items.map(it => (
                    <div key={it.id} className="row" style={{padding:'10px 12px', border:'1px solid var(--line)', borderRadius:10, gap:12}}>
                      <Icon name="drag" size={14}/>
                      <div style={{width:32, height:32, borderRadius:8, background:'var(--bg-2)', display:'grid', placeItems:'center'}}><Icon name={iconMap[it.type]} size={15}/></div>
                      <div className="grow">
                        <div style={{fontSize:11, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.06em', fontWeight:600, marginBottom:2}}>{it.type==='opdracht'?'Opdracht':it.type==='page'?'Pagina':it.type}</div>
                        <div style={{fontSize:14, fontWeight:500}}>{it.title}</div>
                      </div>
                      {it.tags && <div className="row" style={{gap:4}}>{it.tags.map(t=><span key={t} className="chip" style={{fontSize:11}}>{t}</span>)}</div>}
                      <button className="icon-btn" style={{width:28, height:28}}><Icon name="edit" size={12}/></button>
                    </div>
                  ))}
                  <button style={{padding:'10px 12px', border:'1.5px dashed var(--line)', borderRadius:10, background:'transparent', color:'var(--muted)', fontSize:13, fontWeight:500, cursor:'pointer'}}>+ Content toevoegen</button>
                </div>
              )}
            </div>
          ))}
          <button style={{padding:'14px', border:'1.5px dashed var(--line)', borderRadius:12, background:'transparent', color:'var(--muted)', fontSize:14, fontWeight:500, cursor:'pointer'}}><Icon name="plus" size={14}/> Sectie toevoegen</button>
        </div>
        <div className="col" style={{gap:14}}>
          <div className="card">
            <div className="card-head"><h3 style={{fontSize:15}}>Content toevoegen</h3></div>
            <div className="grid" style={{gridTemplateColumns:'1fr 1fr', gap:6}}>
              {[['page','Pagina'],['opdracht','Opdracht'],['file','Bestand'],['video','YouTube'],['forum','Forum'],['lti','LTI']].map(([k,l]) => (
                <button key={k} className="btn ghost sm" style={{justifyContent:'flex-start', padding:'10px 12px'}}><Icon name={iconMap[k]} size={14}/> {l}</button>
              ))}
            </div>
            <div style={{marginTop:10, padding:'10px 12px', background:'var(--accent-100)', borderRadius:10, fontSize:12, color:'var(--accent-700)'}}>
              <Icon name="sparkle" size={12}/> Tip: Ondivera-advies importeren →
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h3 style={{fontSize:15}}>Leervoorkeur-labels</h3></div>
            <div style={{fontSize:12, color:'var(--muted)', marginBottom:10}}>Items met deze labels worden aanbevolen aan leerlingen die ze in hun plan hebben.</div>
            <div className="row" style={{flexWrap:'wrap', gap:6}}>
              <span className="chip primary">Korte video</span><span className="chip primary">Stap-voor-stap</span><span className="chip primary">Stilte</span><span className="chip primary">Tekening</span><span className="chip">Bespreken</span><span className="chip">Pauzes</span><span className="chip">Meer tijd</span>
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h3 style={{fontSize:15}}>Voortgang</h3></div>
            <label className="row" style={{gap:8, fontSize:13}}><span className="toggle"><input type="checkbox" defaultChecked/><span className="slider"/></span> Toon voortgangsbalk aan leerlingen</label>
          </div>
        </div>
      </div>
    </>
  );
}

window.CoachplanVul = CoachplanVul;
window.Cursusbouwer = Cursusbouwer;
