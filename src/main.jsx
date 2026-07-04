
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Home, PenLine, BookOpen, User } from "lucide-react";
import { CARDS, THEMES, generateExercises, QUALITY_REPORT, normalize, LESSONS, CHAPTERS } from "./data";
import "./styles.css";

const KEY = "better-english-v10-5f";

const defaultState = {
  name: "Jeremy",
  xp: 0,
  streak: 0,
  done: 0,
  correct: 0,
  soft: 0,
  bad: 0,
  mode: "learn",
  themes: ["Mix"],
  direction: "mix",
  difficulty: "all",
  type: "mix",
  mistakes: [],
  seen: {},
  recentKeys: [],
  completedLessons: {},
  chapterTests: {},
};

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY)) || {};
    if (!saved.themes) saved.themes = saved.theme ? [saved.theme] : ["Mix"];
    return { ...defaultState, ...saved };
  } catch {
    return defaultState;
  }
}

function distance(a, b) {
  a = normalize(a); b = normalize(b);
  const dp = Array.from({ length: a.length + 1 }, (_, i) => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    dp[i][j] = Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
  }
  return dp[a.length][b.length];
}

function numberWordsToDigits(value) {
  const map = {
    "zero":"0","zéro":"0","un":"1","une":"1","deux":"2","trois":"3","quatre":"4","cinq":"5",
    "six":"6","sept":"7","huit":"8","neuf":"9","dix":"10","onze":"11","douze":"12","treize":"13",
    "quatorze":"14","quinze":"15","seize":"16","vingt":"20","trente":"30","quarante":"40",
    "cinquante":"50","soixante":"60","cent":"100","cents":"100"
  };
  return String(value || "").replace(/\b(zéro|zero|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingt|trente|quarante|cinquante|soixante|cent|cents)\b/gi, (m) => map[m.toLowerCase()] || m);
}

function normalizeSmart(value) {
  return numberWordsToDigits(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’`´]/g, "'")
    .replace(/[.,!?;:]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenList(value) {
  return normalizeSmart(value).split(" ").filter(Boolean);
}

function singularizeToken(t) {
  if (t.length > 3 && t.endsWith("s")) return t.slice(0, -1);
  return t;
}

function looseNoPlural(value) {
  return tokenList(value).map(singularizeToken).join(" ");
}

function missingWords(user, expected) {
  const userSet = new Set(tokenList(user).map(singularizeToken));
  return tokenList(expected).filter(t => !userSet.has(singularizeToken(t)));
}

function detectSmallErrors(user, expected) {
  const errors = [];
  const u = normalizeSmart(user);
  const e = normalizeSmart(expected);
  if (u === e) return errors;

  if (looseNoPlural(user) === looseNoPlural(expected)) {
    const uTokens = tokenList(user);
    const eTokens = tokenList(expected);
    eTokens.forEach((tok, i) => {
      if (uTokens[i] && singularizeToken(uTokens[i]) === singularizeToken(tok) && uTokens[i] !== tok) {
        errors.push(`Accord : "${uTokens[i]}" → "${tok}"`);
      }
    });
  }

  const missing = missingWords(user, expected).filter(w => w.length > 2);
  if (missing.length && missing.length <= 3) {
    errors.push(`Mot${missing.length > 1 ? "s" : ""} manquant${missing.length > 1 ? "s" : ""} : ${missing.join(", ")}`);
  }

  return [...new Set(errors)];
}

function smartScore(user, expected, accepted = []) {
  const allExpected = [expected, ...(accepted || [])].filter(Boolean);
  const normalizedUser = normalizeSmart(user);

  for (const exp of allExpected) {
    if (normalizedUser === normalizeSmart(exp)) {
      return { score: 100, label: "Excellent", type: "good", errors: ["Aucune erreur."], expected: exp };
    }
  }

  for (const exp of allExpected) {
    if (looseNoPlural(user) === looseNoPlural(exp)) {
      return { score: 95, label: "Très bien", type: "good", errors: detectSmallErrors(user, exp), expected: exp };
    }
  }

  let best = { score: 0, expected };
  for (const exp of allExpected) {
    const u = normalizeSmart(user);
    const e = normalizeSmart(exp);
    const maxLen = Math.max(u.length, e.length, 1);
    const dist = distance(u, e);
    const similarity = Math.max(0, Math.round((1 - dist / maxLen) * 100));
    const uTokens = new Set(tokenList(user).map(singularizeToken));
    const eTokens = tokenList(exp).map(singularizeToken);
    const matched = eTokens.filter(t => uTokens.has(t)).length;
    const tokenScore = eTokens.length ? Math.round((matched / eTokens.length) * 100) : 0;
    const score = Math.round(similarity * 0.55 + tokenScore * 0.45);
    if (score > best.score) best = { score, expected: exp };
  }

  if (best.score >= 90) return { score: best.score, label: "Très bien", type: "good", errors: detectSmallErrors(user, best.expected), expected: best.expected };
  if (best.score >= 70) {
    const errs = detectSmallErrors(user, best.expected);
    return { score: best.score, label: "Presque", type: "soft", errors: errs.length ? errs : ["Le sens est proche, mais la réponse est incomplète ou contient plusieurs erreurs."], expected: best.expected };
  }
  return { score: best.score, label: "À revoir", type: "bad", errors: ["La traduction ne correspond pas encore assez à la réponse attendue."], expected: best.expected };
}

function instructionFor(ex) {
  if (!ex) return "";
  if (ex.type === "phrase") return ex.direction === "en-fr" ? "Traduis la phrase entière en français." : "Traduis la phrase entière en anglais.";
  if (ex.type === "translate") {
    if (ex.isPhrase) return ex.direction === "en-fr" ? "Traduis la phrase entière en français." : "Traduis la phrase entière en anglais.";
    return ex.direction === "en-fr" ? "Traduis ce mot ou cette expression en français." : "Traduis ce mot ou cette expression en anglais.";
  }
  if (ex.type === "fill") return "Complète la phrase avec le mot manquant.";
  if (ex.type === "conjugation") return "Écris la forme demandée du verbe.";
  if (ex.type === "choice") return "Choisis la bonne réponse.";
  return "";
}

function placeholderFor(ex) {
  if (!ex) return "Écris ta réponse…";
  if (ex.type === "phrase" || (ex.type === "translate" && ex.isPhrase)) return "Écris la traduction complète…";
  if (ex.type === "translate") return "Écris la traduction…";
  if (ex.type === "conjugation") return "Écris la forme du verbe…";
  return "Écris ta réponse…";
}


function phraseKey(ex) {
  return ex?.phraseKey || ex?.sourceId || normalize(ex?.answer || ex?.question || "");
}

function pickSmart(list, state) {
  if (!list.length) return null;
  const recent = new Set(state.recentKeys || []);
  let pool = list.filter(ex => !recent.has(phraseKey(ex)));

  const recentThemes = (state.recentThemes || []).slice(0, 4);
  const recentCategories = (state.recentCategories || []).slice(0, 4);
  const diverse = pool.filter(ex => !recentThemes.includes(ex.theme) || !recentCategories.includes(ex.category));
  if (diverse.length >= 5) pool = diverse;

  if (!pool.length) pool = list;
  const unseen = pool.filter(ex => !state.seen?.[ex.id]);
  const finalPool = unseen.length ? unseen : pool;

  const weighted = [];
  for (const ex of finalPool) {
    const weight = Math.max(1, Math.round((ex.priority || 50) / 10));
    for (let i = 0; i < weight; i++) weighted.push(ex);
  }
  return weighted[Math.floor(Math.random() * weighted.length)] || finalPool[0];
}

const TYPE_LABELS = {
  mix: "Mix",
  translate: "Traduire",
  fill: "Compléter",
  choice: "QCM",
  conjugation: "Conjugaison",
  phrase: "Phrases",
};
const DIFF_LABELS = { all: "Tout", easy: "Simple", medium: "Moyen", hard: "Dur" };
const DIR_LABELS = { mix: "Mix", "fr-en": "FR → EN", "en-fr": "EN → FR" };

function App() {
  const [tab, setTab] = useState("home");
  const [state, setState] = useState(loadState);
  const [current, setCurrent] = useState(null);
  const [answer, setAnswer] = useState("");
  const [selected, setSelected] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [chapterTest, setChapterTest] = useState(null);
  const [activeLesson, setActiveLesson] = useState(null);
  const [filterOpen, setFilterOpen] = useState("theme");
  const [nameInput, setNameInput] = useState(state.name);
  const [navHidden, setNavHidden] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    if (tab === "path") setTab("home");
  }, [tab]);

  useEffect(() => localStorage.setItem(KEY, JSON.stringify(state)), [state]);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY || 0;
      const delta = y - lastScrollY.current;
      if (y < 40) setNavHidden(false);
      else if (delta > 8) setNavHidden(true);
      else if (delta < -8) setNavHidden(false);
      lastScrollY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const activeThemes = state.type === "conjugation" ? ["Verbes"] : state.themes;

  const exercises = useMemo(() => generateExercises({
    themes: activeThemes,
    type: state.type,
    direction: state.direction,
    difficulty: state.difficulty,
  }), [state.type, state.direction, state.difficulty, state.themes]);

  const activeList = useMemo(() => {
    if (state.mode === "errors") return state.mistakes.map(m => m.exercise);
    return exercises;
  }, [state.mode, state.mistakes, exercises]);

  function chooseNext(list = activeList) {
    if (!list.length) {
      setCurrent(null); setAnswer(""); setSelected(""); setFeedback(null); return;
    }
    const next = state.mode === "errors" ? list[0] : pickSmart(list, state);
    setCurrent(next); setAnswer(""); setSelected(""); setFeedback(null);
  }

  useEffect(() => { if (tab === "exercise") chooseNext(); }, [tab, state.mode, state.themes, state.type, state.difficulty, state.direction]);

  function setType(v) {
    setState(s => ({
      ...s,
      type: v,
      direction: ["translate", "fill", "choice", "phrase"].includes(v) ? s.direction : "mix",
      themes: v === "conjugation" ? ["Verbes"] : s.themes,
    }));
  }


  function chapterOneQuestions() {
    const raw = [
      ["Alphabet", "Quelle lettre se prononce souvent comme « bi » ?", ["B", "E", "I", "R"], "B"],
      ["Alphabet", "Quelle lettre correspond à « double u » ?", ["W", "U", "V", "Y"], "W"],
      ["Alphabet", "Comment demander d'épeler un nom ?", ["Can you spell your name?", "Can you sleep your name?", "Can you speak your name?", "Can you write you name?"], "Can you spell your name?"],
      ["Alphabet", "Que veut dire « spell » dans ce contexte ?", ["épeler", "dormir", "parler", "acheter"], "épeler"],

      ["Pronoms", "« je » en anglais ?", ["I", "You", "He", "They"], "I"],
      ["Pronoms", "« elle » en anglais ?", ["She", "He", "It", "We"], "She"],
      ["Pronoms", "Quel pronom utilise-t-on pour un objet ?", ["It", "He", "She", "They"], "It"],
      ["Pronoms", "« nous » en anglais ?", ["We", "They", "You", "I"], "We"],
      ["Pronoms", "« ils / elles » en anglais ?", ["They", "We", "It", "You"], "They"],

      ["To Be", "I ______ ready.", ["am", "is", "are", "be"], "am"],
      ["To Be", "She ______ at work.", ["is", "am", "are", "be"], "is"],
      ["To Be", "They ______ at home.", ["are", "is", "am", "be"], "are"],
      ["To Be", "You're = ?", ["You are", "You is", "You have", "You do"], "You are"],
      ["To Be", "Quelle phrase est correcte ?", ["I am tired.", "I is tired.", "I are tired.", "I be tired."], "I am tired."],
      ["To Be", "He ______ a doctor.", ["is", "are", "am", "have"], "is"],
      ["To Be", "We ______ ready.", ["are", "is", "am", "has"], "are"],
      ["To Be", "They're = ?", ["They are", "Their are", "There are", "They is"], "They are"],

      ["To Have", "I ______ a phone.", ["have", "has", "am", "is"], "have"],
      ["To Have", "She ______ a question.", ["has", "have", "is", "are"], "has"],
      ["To Have", "They ______ time.", ["have", "has", "is", "does"], "have"],
      ["To Have", "Quelle phrase est correcte ?", ["He has a car.", "He have a car.", "He are a car.", "He haves a car."], "He has a car."],
      ["To Have", "We ______ a problem.", ["have", "has", "are", "does"], "have"],
      ["To Have", "It ______ a name.", ["has", "have", "is", "do"], "has"],

      ["Phrase", "Quel est l'ordre simple en anglais ?", ["Sujet + verbe + complément", "Verbe + sujet + complément", "Complément + verbe + sujet", "Sujet + complément + verbe"], "Sujet + verbe + complément"],
      ["Phrase", "Choisis la phrase correcte.", ["I eat pizza.", "Eat I pizza.", "Pizza eat I.", "I pizza eat."], "I eat pizza."],
      ["Phrase", "She likes music. = ?", ["Elle aime la musique.", "Elle joue de la musique.", "Elle mange la musique.", "Elle écoute toujours."], "Elle aime la musique."],
      ["Phrase", "They play football. = ?", ["Ils jouent au football.", "Ils mangent.", "Ils travaillent.", "Ils dorment."], "Ils jouent au football."],
      ["Phrase", "Quel est le sujet dans « I eat pizza » ?", ["I", "eat", "pizza", "eat pizza"], "I"],

      ["Affirmatif", "Complète : She ______ every day.", ["works", "work", "working", "worked"], "works"],
      ["Affirmatif", "Complète : We ______ football.", ["play", "plays", "playing", "played"], "play"],
      ["Affirmatif", "Quelle phrase est affirmative ?", ["I work.", "I don't work.", "Do I work?", "I am not working."], "I work."],
      ["Affirmatif", "Avec he/she/it au présent simple, on ajoute souvent :", ["-s", "-ed", "-ing", "-en"], "-s"],

      ["Négatif", "I ______ know.", ["don't", "doesn't", "isn't", "aren't"], "don't"],
      ["Négatif", "She ______ work today.", ["doesn't", "don't", "isn't", "aren't"], "doesn't"],
      ["Négatif", "Quelle phrase est correcte ?", ["She doesn't work.", "She doesn't works.", "She don't work.", "She isn't work."], "She doesn't work."],
      ["Négatif", "They ______ ready.", ["aren't", "isn't", "doesn't", "don't"], "aren't"],

      ["Questions", "______ you ready?", ["Are", "Is", "Do", "Does"], "Are"],
      ["Questions", "______ she here?", ["Is", "Are", "Do", "Does"], "Is"],
      ["Questions", "______ you like coffee?", ["Do", "Does", "Is", "Are"], "Do"],
      ["Questions", "______ he work here?", ["Does", "Do", "Is", "Are"], "Does"]
    ];

    return raw.map((q, i) => ({
      id: `chapter1_test_${i + 1}`,
      lesson: q[0],
      type: "choice",
      question: q[1],
      options: q[2],
      answer: q[3],
      accepted: [q[3]],
      theme: "Leçons",
      category: q[0],
      priority: 100
    }));
  }

  function startChapterTest() {
    setChapterTest({ questions: chapterOneQuestions(), index: 0, answers: [], selected: "", finished: false });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function answerChapterTest(option) {
    setChapterTest((test) => test ? { ...test, selected: option } : test);
  }

  function nextChapterTestQuestion() {
    setChapterTest((test) => {
      if (!test || !test.selected) return test;
      const currentQ = test.questions[test.index];
      const result = { question: currentQ, selected: test.selected, correct: normalize(test.selected) === normalize(currentQ.answer) };
      const answers = [...test.answers, result];
      const nextIndex = test.index + 1;
      if (nextIndex >= test.questions.length) {
        const score = Math.round((answers.filter(a => a.correct).length / test.questions.length) * 100);
        return { ...test, answers, finished: true, score, selected: "" };
      }
      return { ...test, answers, index: nextIndex, selected: "" };
    });
  }

  function finishChapterTest() {
    if (!chapterTest?.finished) return;
    const stars = chapterTest.score >= 90 ? 3 : chapterTest.score >= 80 ? 2 : chapterTest.score >= 70 ? 1 : 0;
    setState((s) => ({
      ...s,
      chapterTests: { ...(s.chapterTests || {}), a1_ch1: { score: chapterTest.score, stars } },
      xp: s.xp + (stars * 40)
    }));
    setChapterTest(null);
  }

  function titleFor(ex) {
    if (!ex) return "Aucun exercice";
    if (ex.type === "translate") return "Traduction";
    if (ex.type === "conjugation") return "Conjugaison";
    if (ex.type === "fill") return "Compléter";
    if (ex.type === "choice") return ex.qcmKind === "verb_sentence" ? "QCM conjugaison" : "QCM";
    if (ex.type === "phrase") return "Phrase";
    return "Exercice";
  }

  function expectedLabel(ex) {
    if (ex?.type === "translate" || ex?.type === "phrase") return ex.direction === "fr-en" ? "Bonne réponse anglaise" : "Bonne réponse française";
    return "Bonne réponse";
  }

  function evaluate(value, ex) {
    const result = smartScore(value, ex.answer, ex.accepted || []);
    const title = `${result.label} — ${result.score}%`;
    if (result.score === 100) {
      return { type: "good", title, msg: "Réponse correcte.", score: result.score, errors: result.errors };
    }
    if (result.score >= 90) {
      return { type: "good", title, msg: "Le sens est correct. Il reste une petite erreur.", score: result.score, errors: result.errors };
    }
    if (result.score >= 70) {
      return { type: "soft", title, msg: `Réponse proche. Réponse attendue : ${ex.answer}.`, score: result.score, errors: result.errors };
    }
    return { type: "bad", title, msg: `Réponse attendue : ${ex.answer}.`, score: result.score, errors: result.errors };
  }

  function checkAnswer() {
    const ex = current;
    if (!ex || feedback) return nextExercise();
    const value = ex.type === "choice" ? selected : answer;
    if (!String(value).trim()) {
      setFeedback({ type: "skip", title: "Choisis une réponse", msg: "Sélectionne une option avant de valider.", empty: true });
      return;
    }
    const result = evaluate(value, ex);
    const seenBefore = state.seen?.[ex.id] || 0;
    setFeedback({ ...result, seenBefore, value });

    setState(s => {
      const seen = { ...(s.seen || {}) };
      seen[ex.id] = (seen[ex.id] || 0) + 1;
      const key = phraseKey(ex);
      const recentKeys = [key, ...(s.recentKeys || []).filter(k => k !== key)].slice(0, 60);
      const recentThemes = [ex.theme, ...(s.recentThemes || []).filter(t => t !== ex.theme)].slice(0, 12);
      const recentCategories = [ex.category, ...(s.recentCategories || []).filter(c => c !== ex.category)].slice(0, 12);
      const mistakes = result.type === "bad" ? [{ answer: value, exercise: ex }, ...(s.mistakes || [])].slice(0, 100) : s.mistakes || [];
      return {
        ...s, seen, recentKeys, recentThemes, recentCategories, mistakes,
        done: s.done + 1,
        correct: result.type === "good" ? s.correct + 1 : s.correct,
        soft: result.type === "soft" ? s.soft + 1 : s.soft,
        bad: result.type === "bad" ? s.bad + 1 : s.bad,
        streak: result.type === "bad" ? 0 : s.streak + 1,
        xp: s.xp + (result.type === "good" ? 10 : result.type === "soft" ? 6 : 0),
      };
    });
  }

  function revealAnswer() {
    const ex = current;
    if (!ex || feedback) return nextExercise();
    setFeedback({ type: "skip", title: "Réponse affichée", msg: "Regarde la réponse, puis passe à la suivante.", skipped: true, seenBefore: state.seen?.[ex.id] || 0 });
    setState(s => {
      const key = phraseKey(ex);
      return { ...s, recentKeys: [key, ...(s.recentKeys || []).filter(k => k !== key)].slice(0, 60) };
    });
  }

  function nextExercise() {
    if (state.mode === "errors" && current) {
      setState(s => ({ ...s, mistakes: (s.mistakes || []).filter(m => m.exercise.id !== current.id) }));
    }
    chooseNext();
  }

  const accuracy = state.done ? Math.round(((state.correct + state.soft) / state.done) * 100) : 0;
  const level = Math.floor(state.xp / 100) + 1;

  const nav = [
    ["home", "Accueil", Home],
    ["exercise", "S'entraîner", PenLine],
    ["courses", "Leçons", BookOpen],
    ["profile", "Profil", User],
  ];

  return (
    <div className="app">
      <header className="header">
        <div className="brand"><h1>Better English</h1><p>Bonjour {state.name}</p></div>
        <div className="streak-pill">{state.streak} série</div>
      </header>

      <div className={`top-tabs ${navHidden ? "hide" : ""}`}>
        {nav.map(([id,label]) => (
          <button
            key={id}
            className={tab===id ? "active" : ""}
            onClick={() => {
              setActiveLesson(null);
              setChapterTest(null);
              setTab(id);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {chapterTest && (
        <section className="screen active">
          <ChapterTestView
            test={chapterTest}
            onSelect={answerChapterTest}
            onNext={nextChapterTestQuestion}
            onFinish={finishChapterTest}
            onClose={() => setChapterTest(null)}
          />
        </section>
      )}

      {activeLesson && (
        <section className="screen active">
          <LessonPlayer
            lesson={activeLesson}
            onBack={() => setActiveLesson(null)}
            done={!!state.completedLessons?.[activeLesson.id]}
            onGoExercise={() => {
              setActiveLesson(null);
              setTab("exercise");
            }}
            onComplete={() => {
              setState((s) => ({
                ...s,
                completedLessons: { ...(s.completedLessons || {}), [activeLesson.id]: true },
                xp: s.xp + 30,
              }));
            }}
            onUndoComplete={() => {
              setState((s) => {
                const nextCompleted = { ...(s.completedLessons || {}) };
                delete nextCompleted[activeLesson.id];
                return { ...s, completedLessons: nextCompleted };
              });
            }}
          />
        </section>
      )}

      {!chapterTest && !activeLesson && <>

      {tab === "home" && (
        <section className="screen active">
          <div className="hero-card">
            <div className="hero-inner">
              <div className="hero-label">V10.5fdc.5a.5.4.3a</div>
              <h2 className="hero-title">Leçons interactives</h2>
              <p className="hero-sub">Better English apprend l’anglais qu’on rencontre dans la vraie vie, pas l’anglais des manuels scolaires.</p>
              <div className="progress"><span style={{ width: `${state.xp % 100}%` }} /></div>
              <button className="btn full" onClick={() => setTab("exercise")}>Continuer</button>
            </div>
          </div>
          <div className="grid2">
            <Stat value={CARDS.length} label="fiches" />
            <Stat value={QUALITY_REPORT.exercises} label="exos possibles" />
            <Stat value={QUALITY_REPORT.qcm} label="QCM" />
            <Stat value={`${accuracy}%`} label="précision" />
          </div>
        </section>
      )}

      {tab === "exercise" && (
        <section className="screen active">
          <div className="mode-switch two">
            <button className={state.mode==="learn" ? "active" : ""} onClick={() => setState(s=>({...s,mode:"learn"}))}>Apprendre</button>
            <button className={state.mode==="errors" ? "active" : ""} onClick={() => setState(s=>({...s,mode:"errors"}))}>Erreurs</button>
          </div>

          {state.mode === "learn" && (
            <div className="card">
              <div className="section-title"><h2>Exercices</h2><span className="tag">{exercises.length} exos</span></div>
              <p className="muted">Chaque mode a son rôle : traduire, compléter, QCM, conjugaison ou phrases.</p>

              <Filter title="Type" label={TYPE_LABELS[state.type]} id="type" open={filterOpen} setOpen={setFilterOpen}>
                {[["mix","Mix"],["translate","Traduire"],["fill","Compléter"],["choice","QCM"],["conjugation","Conjugaison"],["phrase","Phrases"]].map(([v,l]) => (
                  <button key={v} className={state.type===v ? "active" : ""} onClick={() => setType(v)}>{l}</button>
                ))}
              </Filter>

              {state.type !== "conjugation" ? (
                <Filter title="Thèmes" label={state.themes?.includes("Mix") ? "Tous" : `${state.themes.length} sélectionné${state.themes.length>1?"s":""}`} id="theme" open={filterOpen} setOpen={setFilterOpen}>
                  {THEMES.map(v => <button type="button" key={v} className={state.themes?.includes(v) ? "active" : ""} onClick={() => setState(s => {
                    let themes = s.themes || ["Mix"];
                    if (v === "Mix") return { ...s, themes: ["Mix"] };
                    themes = themes.filter(x => x !== "Mix");
                    themes = themes.includes(v) ? themes.filter(x => x !== v) : [...themes, v];
                    if (!themes.length) themes = ["Mix"];
                    return { ...s, themes };
                  })}>{v === "Mix" ? "Tous les thèmes" : v}</button>)}
                </Filter>
              ) : (
                <div className="locked-filter"><small>Thème verrouillé</small><b>Verbes</b></div>
              )}

              {["translate","fill","choice","phrase"].includes(state.type) && (
                <Filter title="Sens" label={DIR_LABELS[state.direction]} id="direction" open={filterOpen} setOpen={setFilterOpen}>
                  {[["mix","Mix"],["fr-en","FR → EN"],["en-fr","EN → FR"]].map(([v,l]) => (
                    <button key={v} className={state.direction===v ? "active" : ""} onClick={() => setState(s=>({...s,direction:v}))}>{l}</button>
                  ))}
                </Filter>
              )}

              <Filter title="Difficulté" label={DIFF_LABELS[state.difficulty]} id="difficulty" open={filterOpen} setOpen={setFilterOpen}>
                {[["all","Tout"],["easy","Simple"],["medium","Moyen"],["hard","Dur"]].map(([v,l]) => (
                  <button key={v} className={state.difficulty===v ? "active" : ""} onClick={() => setState(s=>({...s,difficulty:v}))}>{l}</button>
                ))}
              </Filter>
            </div>
          )}

          <div className="exercise-card">
            {!current ? (
              <>
                <h2 className="chapter-title">{state.mode === "errors" ? "Aucune erreur" : "Aucun exercice propre"}</h2>
                <h3 className="question">{state.mode === "errors" ? "Tu n’as aucune vraie erreur à revoir." : "Aucun exercice ne correspond à ces critères."}</h3>
                <p className="muted">Change le thème, le type, le sens ou la difficulté.</p>
              </>
            ) : (
              <>
                <h2 className="chapter-title">{titleFor(current)}</h2>
                <h3 className="question">{current.question}</h3>
                {instructionFor(current) && <p className="exercise-instruction">{instructionFor(current)}</p>}
                <div className="info-grid">
                  {(current.type === "translate" || current.type === "phrase" || current.type === "choice") && current.direction && <Info label="Sens" value={current.direction === "fr-en" ? "Français → Anglais" : current.direction === "en-fr" ? "Anglais → Français" : "Mix"} />}
                  {current.type === "choice" && current.qcmKind === "verb_sentence" && current.hint && <Info label="Verbe" value={current.hint} />}
                  {current.type === "fill" && !current.isVerb && current.hint && <Info label="Indice" value={current.hint} />}
                  {(current.type === "conjugation" || current.isVerb) && current.tense && <Info label="Forme demandée" value={current.tense} />}
                  <Info label="Thème" value={current.theme} />
                  {current.isVerb && current.verbType && <Info label="Type" value={current.verbType} />}
                </div>

                {current.type === "fill" && !current.isVerb && current.translation && (
                  <div className="pre-translation"><small>Traduction</small><b>{current.translation}</b></div>
                )}

                {current.type === "choice" ? (
                  <div className={`choice-options ${current.type === "choice" ? "qcm-panel" : ""}`}>
                    {current.options.map(opt => <button key={opt} className={`choice-btn ${selected===opt ? "selected" : ""}`} onClick={() => setSelected(opt)}>{opt}</button>)}
                  </div>
                ) : (
                  <input className="answer" disabled={!!feedback && !feedback.empty} value={answer} onChange={e=>setAnswer(e.target.value)} onKeyDown={e=>e.key==="Enter"&&checkAnswer()} placeholder={placeholderFor(current)} />
                )}

                <div className="row">
                  <button className="btn" onClick={feedback && !feedback.empty ? nextExercise : checkAnswer}>{feedback && !feedback.empty ? "Suivant" : current.type === "choice" ? "Valider" : "Vérifier"}</button>
                  {!feedback && <button className="btn secondary" onClick={revealAnswer}>Passer</button>}
                </div>

                {feedback && (
                  <div className={`feedback show ${feedback.type}`}>
                    <h3>{feedback.title}</h3>
                    <p>{feedback.msg}</p>
                    {!feedback.empty && (
                      <>
                        <div className="example"><b>{expectedLabel(current)}</b><br />{current.answer}</div>
                        {feedback.errors?.length > 0 && (
                          <div className="correction-details">
                            <b>Analyse</b>
                            {feedback.errors.map((err, idx) => <p key={idx}>• {err}</p>)}
                          </div>
                        )}
                        {current.translation && <div className="example"><b>Traduction</b><br />{current.translation}</div>}
                        {current.explain && <p>{current.explain}</p>}
                        {current.isVerb && current.forms && (
                          <div className="verb-table">
                            <b>Formes du verbe</b>
                            <div><span>Infinitif</span><strong>{current.forms.base}</strong></div>
                            <div><span>Prétérit</span><strong>{current.forms.past}</strong></div>
                            <div><span>Participe passé</span><strong>{current.forms.participle}</strong></div>
                            <div><span>Forme en -ING</span><strong>{current.forms.ing}</strong></div>
                          </div>
                        )}
                        {current.example && <div className="example"><b>Exemple</b><br />{current.example}</div>}
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      )}

      {tab === "courses" && (
        <section className="screen active">
          {CHAPTERS.map((chapter) => (
            <ChapterBlock
              key={chapter.id}
              chapter={chapter}
              lessons={LESSONS.filter((l) => l.chapterId === chapter.id)}
              completed={state.completedLessons || {}}
              tests={state.chapterTests || {}}
              onOpenLesson={(lesson) => setActiveLesson(lesson)}
              onTest={startChapterTest}
            />
          ))}
        </section>
      )}

      {tab === "profile" && (
        <section className="screen active">
          <div className="card profile-hero">
            <div className="avatar">{(state.name || "J").slice(0,1).toUpperCase()}</div>
            <h2 className="profile-name">{state.name}</h2>
            <p className="profile-sub">Niveau {level}</p>
            <input className="profile-input" value={nameInput} onChange={e=>setNameInput(e.target.value)} placeholder="Ton nom" />
            <button className="btn full" style={{marginTop:10}} onClick={()=>setState(s=>({...s,name:nameInput.trim()||s.name}))}>Changer le nom</button>
          </div>
          <div className="grid2">
            <Stat value={state.xp} label="XP" />
            <Stat value={`${accuracy}%`} label="précision" />
            <Stat value={state.done} label="réponses" />
            <Stat value={state.mistakes.length} label="erreurs" />
          </div>
        </section>
      )}
      </>}
    </div>
  );
}

function Stat({ value, label }) {
  return <div className="stat-card"><span className="stat-value">{value}</span><span className="stat-label">{label}</span></div>;
}
function Info({ label, value }) {
  return <div className="info-box"><small>{label}</small><b>{value}</b></div>;
}
function Filter({ title, label, id, open, setOpen, children }) {
  const isOpen = open === id;
  return <div className={`filter-section ${isOpen ? "open" : ""}`}>
    <button className="filter-head" onClick={() => setOpen(isOpen ? "" : id)}><span>{title}</span><small>{label}</small></button>
    <div className="filter-body"><div className="mode-switch train-switch">{children}</div></div>
  </div>;
}




function speakEnglish(text) {
  try {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.75;
    window.speechSynthesis.speak(utterance);
  } catch (e) {
    console.warn("Speech synthesis unavailable", e);
  }
}

function shuffleArray(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function makeLetterOptions(correct, letters) {
  const others = letters.filter((l) => l.letter !== correct.letter);
  return shuffleArray([correct, ...shuffleArray(others).slice(0, 3)]).map((l) => l.letter);
}

function ChapterBlock({ chapter, lessons, completed, tests, onOpenLesson, onTest }) {
  const [openChapter, setOpenChapter] = React.useState(Boolean(chapter.unlocked));
  const doneCount = lessons.filter((l) => completed[l.id]).length;
  const pct = lessons.length ? Math.round((doneCount / lessons.length) * 100) : 0;
  const locked = !chapter.unlocked;
  const test = tests[chapter.id];

  return (
    <div className={`card chapter-block ${locked ? "locked" : ""}`}>
      <button type="button" className="chapter-head" onClick={() => !locked && setOpenChapter(!openChapter)}>
        <div>
          <small>{chapter.level || "A1"}</small>
          <h2>{chapter.order}. {chapter.title}</h2>
          <p>{chapter.description}</p>
        </div>
        <span className="tag">{locked ? "Verrouillé" : `${pct}%`}</span>
      </button>

      {!locked && openChapter && (
        <div className="chapter-body">
          <div className="progress"><span style={{ width: `${pct}%` }} /></div>
          <p className="muted">{doneCount}/{lessons.length} leçons terminées</p>

          {lessons.map((lesson) => (
            <div className={`lesson-row ${completed[lesson.id] ? "done" : ""}`} key={lesson.id}>
              <button type="button" className="lesson-row-head" onClick={() => onOpenLesson(lesson)}>
                <div>
                  <small>{lesson.level} · {lesson.duration}</small>
                  <b>{lesson.order}. {lesson.title}</b>
                  <span>{lesson.objective}</span>
                </div>
                <em>{completed[lesson.id] ? "Revoir" : "Ouvrir"}</em>
              </button>
            </div>
          ))}

          <div className="chapter-test">
            <div className="section-title"><h3>Test du chapitre</h3><span className="tag">40 questions</span></div>
            <p className="muted">40 questions uniquement sur ce chapitre.</p>
            {test ? <p className="test-score">Score : {test.score}% · {test.stars}/3 étoiles</p> : <button type="button" className="btn full" onClick={onTest}>Commencer le test</button>}
          </div>
        </div>
      )}
    </div>
  );
}

function LessonPlayer({ lesson, onBack, onComplete, onUndoComplete, onGoExercise, done }) {
  const isLetterLesson = lesson.interactiveType === "letter_pronunciation" || lesson.letterSounds?.length;

  return (
    <div className="lesson-player card">
      <div className="lesson-player-head">
        <button type="button" className="back-btn" onClick={onBack}>Retour</button>
        <span className="tag">{lesson.level} · {lesson.duration}</span>
      </div>

      <h2>{lesson.title}</h2>
      <p className="muted">{lesson.objective}</p>

      {(lesson.sections || []).map((section, index) => (
        <div className="lesson-section" key={index}>
          <h3>{section.title}</h3>
          <p>{section.body}</p>
        </div>
      ))}

      {isLetterLesson ? (
        <LetterPronunciationLesson letters={lesson.letterSounds || []} />
      ) : (
        <div className="lesson-summary">
          <h3>Exercices de leçon</h3>
          <p>Les mini-exercices intégrés seront ajoutés sur cette leçon après validation du modèle.</p>
        </div>
      )}

      <div className="lesson-summary">
        <h3>Résumé</h3>
        {(lesson.summary || []).map((item, index) => <p key={index}>✓ {item}</p>)}
      </div>

      <div className="row lesson-actions">
        <button type="button" className="btn" onClick={onGoExercise}>Aller aux exercices</button>
        <button type="button" className="btn secondary" onClick={done ? onUndoComplete : onComplete}>
          {done ? "Annuler la validation" : "Terminer la leçon"}
        </button>
      </div>
    </div>
  );
}

function LetterPronunciationLesson({ letters }) {
  const [quiz, setQuiz] = React.useState(null);

  function startQuiz() {
    const cycle = shuffleArray(letters);
    const current = cycle[0];
    setQuiz({
      cycle,
      index: 0,
      current,
      options: makeLetterOptions(current, letters),
      selected: "",
      feedback: "",
      completedCycles: 0
    });
    setTimeout(() => speakEnglish(current.audioText || current.speech || current.letter), 150);
  }

  function choose(letter) {
    setQuiz((q) => {
      if (!q) return q;
      const good = letter === q.current.letter;
      return {
        ...q,
        selected: letter,
        feedback: good ? "Correct." : `Raté. La bonne réponse était ${q.current.letter}.`
      };
    });
  }

  function nextQuestion() {
    setQuiz((q) => {
      if (!q || !q.selected) return q;
      const nextIndex = q.index + 1;

      if (nextIndex >= q.cycle.length) {
        const newCycle = shuffleArray(letters);
        const current = newCycle[0];
        setTimeout(() => speakEnglish(current.audioText || current.speech || current.letter), 150);
        return {
          cycle: newCycle,
          index: 0,
          current,
          options: makeLetterOptions(current, letters),
          selected: "",
          feedback: "Cycle terminé. Nouveau mélange lancé.",
          completedCycles: q.completedCycles + 1
        };
      }

      const current = q.cycle[nextIndex];
      setTimeout(() => speakEnglish(current.audioText || current.speech || current.letter), 150);
      return {
        ...q,
        index: nextIndex,
        current,
        options: makeLetterOptions(current, letters),
        selected: "",
        feedback: ""
      };
    });
  }

  return (
    <div className="letter-lesson">
      <div className="letter-sound-grid">
        {letters.map((item) => (
          <div className="letter-sound-card" key={item.letter}>
            <strong>{item.letter}</strong>
            <button type="button" onClick={() => speakEnglish(item.audioText || item.speech || item.letter)}>Écouter</button>
          </div>
        ))}
      </div>

      <div className="letter-quiz-card">
        <div className="section-title">
          <h3>Quiz d'écoute</h3>
          <span className="tag">{quiz ? `${quiz.index + 1}/26` : "Prêt"}</span>
        </div>

        {!quiz ? (
          <>
            <p className="muted">Écoute une lettre, choisis la bonne réponse. Chaque lettre passe une seule fois avant de recommencer dans un nouvel ordre.</p>
            <button type="button" className="btn full" onClick={startQuiz}>Commencer le quiz</button>
          </>
        ) : (
          <>
            <p className="muted">Quelle lettre viens-tu d'entendre ?</p>
            <button type="button" className="btn full replay-btn" onClick={() => speakEnglish(quiz.current.audioText || quiz.current.speech || quiz.current.letter)}>Réécouter</button>

            <div className="letter-options">
              {quiz.options.map((option) => (
                <button
                  type="button"
                  key={option}
                  className={`letter-option ${quiz.selected === option ? (option === quiz.current.letter ? "good" : "bad") : ""}`}
                  onClick={() => choose(option)}
                >
                  {option}
                </button>
              ))}
            </div>

            {quiz.feedback && <p className={`letter-feedback ${quiz.feedback === "Correct." ? "good" : "bad"}`}>{quiz.feedback}</p>}

            <button
              type="button"
              className="btn full"
              onClick={nextQuestion}
              disabled={!quiz.selected}
            >
              {quiz.index + 1 >= quiz.cycle.length ? "Nouveau cycle" : "Lettre suivante"}
            </button>

            <p className="muted cycle-note">Cycles terminés : {quiz.completedCycles}</p>
          </>
        )}
      </div>
    </div>
  );
}

function ChapterTestView({ test, onSelect, onNext, onFinish, onClose }) {
  if (test.finished) {
    const correct = test.answers.filter(a => a.correct).length;
    const byLesson = {};
    test.answers.forEach(a => {
      byLesson[a.question.lesson] ||= { ok: 0, total: 0 };
      byLesson[a.question.lesson].total += 1;
      if (a.correct) byLesson[a.question.lesson].ok += 1;
    });
    const stars = test.score >= 90 ? 3 : test.score >= 80 ? 2 : test.score >= 70 ? 1 : 0;

    return (
      <div className="exercise-card test-card">
        <h2 className="chapter-title">Résultat du test</h2>
        <h3 className="question">{correct}/40 · {test.score}%</h3>
        <p className="test-stars">{stars}/3 étoiles</p>
        <div className="lesson-summary">
          <h3>Détail</h3>
          {Object.entries(byLesson).map(([name, s]) => <p key={name}>{name} : {s.ok}/{s.total}</p>)}
        </div>
        <div className="row">
          <button className="btn" onClick={onFinish}>Valider</button>
          <button className="btn secondary" onClick={onClose}>Fermer</button>
        </div>
      </div>
    );
  }

  const q = test.questions[test.index];
  return (
    <div className="exercise-card test-card">
      <div className="section-title"><h2>Test Chapitre 1</h2><span className="tag">{test.index + 1}/40</span></div>
      <h3 className="question">{q.question}</h3>
      <div className="info-grid">
        <Info label="Leçon" value={q.lesson} />
        <Info label="Type" value="QCM" />
      </div>
      <div className="choice-options qcm-panel">
        {q.options.map((opt) => (
          <button key={opt} className={`choice-btn ${test.selected === opt ? "selected" : ""}`} onClick={() => onSelect(opt)}>
            {opt}
          </button>
        ))}
      </div>
      <div className="row">
        <button className="btn" onClick={onNext}>{test.index === 39 ? "Terminer" : "Suivant"}</button>
        <button className="btn secondary" onClick={onClose}>Quitter</button>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
