// Coachplan wizard
const { useState: uSC } = React;

const QUESTIONS = [
  { id: 1, theme: 'Welkom', q: 'Hoi Sami! Hoe gaat het de laatste tijd op school?', help: 'Schrijf zoveel als je wil. Er zijn geen foute antwoorden.', type: 'text' },
  { id: 2, theme: 'Welkom', q: 'Wat zou je graag willen leren of verbeteren?', help: 'Denk aan een vak, vaardigheid of iets persoonlijks.', type: 'text' },
  { id: 3, theme: 'Hoe leer ik', q: 'Wanneer kun jij goed leren?', help: 'Meerdere antwoorden mogen.', type: 'multi', options: ['In de ochtend','Na school','In het weekend','In stilte','Met muziek','Met iemand erbij','Op mijn eigen plek','In de klas'] },
  { id: 4, theme: 'Hoe leer ik', q: 'Hoe pak je nieuwe stof het liefst aan?', help: 'Dit helpt ons je leeromgeving in te stellen.', type: 'multi', options: ['Korte video kijken','Stap-voor-stap lezen','Iets uitproberen','Met iemand bespreken','Naar een podcast luisteren','Zelf opschrijven'] },
  { id: 5, theme: 'Hoe leer ik', q: 'Wat helpt je als iets moeilijk is?', type: 'multi', options: ['Een voorbeeld','Een tekening of schema','Iemand die het uitlegt','Eerst rust','Pauze nemen','Vragen aan vrienden'] },
  { id: 6, theme: 'Wat heb ik nodig', q: 'Zijn er dingen waar je rekening mee wilt houden?', help: 'Bijv. dyslexie, ADHD, concentratie, geluid, licht…', type: 'multi', options: ['Lezen kost me moeite','Stilte is fijn','Veel licht is vervelend','Even lopen helpt','Korte instructies werken beter','Ik heb meer tijd nodig'] },
  { id: 7, theme: 'Wat heb ik nodig', q: 'Wat geeft je energie op school?', type: 'text' },
  { id: 8, theme: 'Afronding', q: 'Wat zou je nog willen zeggen tegen je coach?', help: 'Optioneel. Alleen jij en Mira lezen dit.', type: 'text' },
];

function Coachplan() {
  const [step, setStep] = uSC(0);
  const [answers, setAnswers] = uSC({});
  const [done, setDone] = uSC(false);
  const total = QUESTIONS.length;
  const q = QUESTIONS[step];
  const a = answers[q?.id] || (q?.type==='multi'?[]:'');

  const setAnswer = v => setAnswers(s => ({...s, [q.id]: v}));
  const setFlag = (key, val) => setAnswers(s => ({...s, ['_flag_'+q.id]: {...(s['_flag_'+q.id]||{}), [key]: val}}));
  const flags = answers['_flag_'+q?.id] || {};

  if (done) return <CoachplanOverview answers={answers} onEdit={(id)=>{setStep(QUESTIONS.findIndex(x=>x.id===id)); setDone(false);}}/>;

  const next = () => step < total - 1 ? setStep(step+1) : setDone(true);
  const prev = () => setStep(Math.max(0, step-1));
  const skip = () => { setFlag('skipped', true); next(); };

  return (
    <div style={{maxWidth:760, margin:'0 auto'}}>
      <div className="row between" style={{marginBottom:16}}>
        <div className="row" style={{gap:8}}>
          <span className="chip primary">{q.theme}</span>
          <span className="chip">Stap {step+1} van {total}</span>
        </div>
        <button className="btn ghost sm">Opslaan & afsluiten</button>
      </div>
      <div className="progress" style={{marginBottom:32}}><span style={{width: ((step+1)/total*100)+'%'}}/></div>

      <h1 style={{fontSize:30, lineHeight:1.2, textWrap:'balance', marginBottom:8}}>{q.q}</h1>
      {q.help && <div style={{color:'var(--muted)', fontSize:15, marginBottom:24}}>{q.help}</div>}

      {q.type === 'text' && (
        <textarea className="textarea" placeholder="Begin maar te typen…" value={a} onChange={e=>setAnswer(e.target.value)} style={{minHeight:160, fontSize:15, padding:16}}/>
      )}
      {q.type === 'multi' && (
        <div className="grid" style={{gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:8}}>
          {q.options.map(opt => {
            const on = (a||[]).includes(opt);
            return (
              <button key={opt} onClick={()=>{
                const cur = a||[];
                setAnswer(on ? cur.filter(x=>x!==opt) : [...cur, opt]);
              }} style={{
                textAlign:'left', padding:'14px 16px', borderRadius:12,
                border:'1.5px solid '+(on?'var(--primary)':'var(--line)'),
                background: on?'var(--primary-50)':'var(--surface)',
                color: on?'var(--primary-700)':'var(--ink)', fontWeight: on?600:500, fontSize:14,
                display:'flex', alignItems:'center', gap:10, cursor:'pointer'
              }}>
                <div style={{width:20, height:20, borderRadius:6, border:'1.5px solid '+(on?'var(--primary)':'var(--line)'), background: on?'var(--primary)':'transparent', color:'#fff', display:'grid', placeItems:'center', flexShrink:0}}>
                  {on && <Icon name="check" size={13} stroke={2.5}/>}
                </div>
                {opt}
              </button>
            );
          })}
        </div>
      )}

      <div className="row" style={{marginTop:24, gap:12, padding:'14px 16px', background:'var(--bg-2)', borderRadius:12, border:'1px dashed var(--line)'}}>
        <label className="row" style={{gap:10, cursor:'pointer', flex:1}}>
          <input type="checkbox" checked={!!flags.discuss} onChange={e=>setFlag('discuss', e.target.checked)} style={{width:18, height:18, accentColor:'var(--accent)'}}/>
          <div><div style={{fontWeight:500, fontSize:14}}>Dit wil ik graag bespreken met mijn coach</div><div style={{fontSize:12, color:'var(--muted)'}}>Mira ziet een vlaggetje bij dit antwoord.</div></div>
        </label>
      </div>

      <div className="row between" style={{marginTop:32}}>
        <button className="btn ghost" disabled={step===0} onClick={prev}><Icon name="arrow-left" size={14}/> Terug</button>
        <div className="row" style={{gap:8}}>
          <button className="btn ghost" onClick={skip}>Sla over</button>
          <button className="btn primary lg" onClick={next}>{step===total-1?'Klaar — overzicht':'Volgende'} <Icon name="arrow-right" size={15}/></button>
        </div>
      </div>
    </div>
  );
}

function CoachplanOverview({ answers, onEdit }) {
  const themes = [...new Set(QUESTIONS.map(q=>q.theme))];
  return (
    <div style={{maxWidth:820, margin:'0 auto'}}>
      <div className="page-head">
        <div>
          <h1>Mooi gedaan, Sami! 🎉</h1>
          <div className="sub">Bekijk hieronder je antwoorden. Je kunt ze nog aanpassen voordat je verzendt.</div>
        </div>
      </div>
      {themes.map(theme => (
        <div key={theme} className="card" style={{marginBottom:16}}>
          <div className="card-head"><h3>{theme}</h3></div>
          <div className="col" style={{gap:14}}>
            {QUESTIONS.filter(q=>q.theme===theme).map(q => {
              const a = answers[q.id];
              const f = answers['_flag_'+q.id] || {};
              const empty = !a || (Array.isArray(a)&&a.length===0);
              return (
                <div key={q.id} style={{paddingBottom:14, borderBottom:'1px solid var(--line-2)'}}>
                  <div className="row between">
                    <div style={{fontWeight:500, fontSize:14, color:'var(--ink-2)', flex:1}}>{q.q}</div>
                    <button className="btn ghost sm" onClick={()=>onEdit(q.id)}><Icon name="edit" size={13}/> Wijzig</button>
                  </div>
                  <div style={{marginTop:8, fontSize:14, color: empty?'var(--muted)':'var(--ink)'}}>
                    {f.skipped ? <span className="chip warning">Overgeslagen</span> :
                     empty ? <span style={{fontStyle:'italic'}}>Niet ingevuld</span> :
                     Array.isArray(a) ? <div className="row" style={{flexWrap:'wrap', gap:6}}>{a.map(v=>(<span key={v} className="chip primary">{v}</span>))}</div> :
                     a}
                  </div>
                  {f.discuss && <div className="chip accent" style={{marginTop:8}}><Icon name="flag" size={12}/> Bespreken met coach</div>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div className="card" style={{background:'var(--primary)', borderColor:'var(--primary)', color:'#fff', display:'flex', alignItems:'center', gap:16}}>
        <div className="grow"><h3 style={{color:'#fff'}}>Verzend naar Mira</h3><div style={{fontSize:13, opacity:0.85, marginTop:4}}>Mira krijgt een bericht en jullie bespreken dit in jullie volgende gesprek.</div></div>
        <button className="btn" style={{background:'#fff', color:'var(--primary-700)'}}><Icon name="send" size={14}/> Verzenden</button>
      </div>
    </div>
  );
}

window.Coachplan = Coachplan;
