// Leaderboard helper with Firestore and localStorage fallback
// IMPORTANT: Set your Firebase config below OR set window.FIREBASE_CONFIG before this script runs.
(function(){
    // Paste your Firebase config here, or set window.FIREBASE_CONFIG from the HTML before this script.
    const firebaseConfig = window.FIREBASE_CONFIG || {
        // apiKey: "YOUR_API_KEY",
        // authDomain: "YOUR_AUTH_DOMAIN",
        // projectId: "YOUR_PROJECT_ID",
        // storageBucket: "YOUR_STORAGE_BUCKET",
        // messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
        // appId: "YOUR_APP_ID"
    };

    let db = null;
    let remoteEnabled = false;
    // Supabase client (optional)
    let supabaseClient = null;
    let supabaseEnabled = false;
    // readiness promise: resolves when initial backend detection (supabase/firestore) completed
    let _readyResolve;
    const ready = new Promise(resolve => { _readyResolve = resolve; });
    // track whether we attempted to initialize Supabase (so we know whether to wait)
    let supabaseAttempted = false;

    try {
        // Initialize Supabase dynamically if config provided
        const supabaseUrl = window.SUPABASE_URL || (window.SUPABASE && window.SUPABASE.url);
        const supabaseKey = window.SUPABASE_KEY || (window.SUPABASE && window.SUPABASE.key);
        if (supabaseUrl && supabaseKey) {
            supabaseAttempted = true;
            // dynamic ESM import from CDN (+esm) works in modern browsers
            import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm').then(mod => {
                try {
                    supabaseClient = mod.createClient(supabaseUrl, supabaseKey);
                    supabaseEnabled = true;
                    console.log('Leaderboard: Supabase enabled');
                } catch (e) {
                    console.error('Leaderboard: Supabase init failed', e);
                }
            }).catch(err => {
                console.error('Leaderboard: failed to load supabase client', err);
            }).finally(() => {
                // mark ready after attempting to load supabase
                try { _readyResolve(); } catch(e){}
            });
        }

        if (typeof firebase !== 'undefined') {
            // If config is provided (not empty), initialize
            const hasConfig = Object.keys(firebaseConfig || {}).length > 0;
            if (hasConfig) {
                if (!firebase.apps || firebase.apps.length === 0) {
                    firebase.initializeApp(firebaseConfig);
                }
                db = firebase.firestore();
                remoteEnabled = true;
                console.log('Leaderboard: Firestore enabled');
            } else {
                console.log('Leaderboard: No Firebase config found — using local fallback');
            }
        } else {
            console.log('Leaderboard: Firebase SDK not loaded — using local fallback');
        }
    } catch (e) {
        console.error('Leaderboard init error', e);
    }
    // If supabase wasn't attempted, resolve ready now
    if (!supabaseAttempted) {
        try { _readyResolve(); } catch(e){}
    }

    function calculateCareerRank(score) {
        if (score >= 90) return 'Stream Legend';
        if (score >= 80) return 'Prodigy';
        if (score >= 60) return 'Director';
        if (score >= 40) return 'Producer';
        if (score >= 20) return 'Apprentice';
        return 'Trainee';
    }

    function submitScore(name, score, rank) {
        rank = rank || calculateCareerRank(score);
        // Preference order: Supabase -> Firestore -> local
        if (supabaseEnabled && supabaseClient) {
            return supabaseClient.from('leaderboard').insert([{ name, score, rank }]).then(({data, error}) => {
                if (error) return Promise.reject(error);
                return Promise.resolve();
            });
        } else if (remoteEnabled && db) {
            return db.collection('leaderboard').add({
                name,
                score,
                rank,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            }).then(docRef => {
                return Promise.resolve();
            });
        } else {
            // local fallback
            try {
                const arr = JSON.parse(localStorage.getItem('local_leaderboard') || '[]');
                arr.push({name, score, rank, ts: Date.now()});
                arr.sort((a,b) => b.score - a.score);
                localStorage.setItem('local_leaderboard', JSON.stringify(arr.slice(0,50)));
                return Promise.resolve();
            } catch (e) {
                return Promise.reject(e);
            }
        }
    }

    function fetchTop(limit = 10) {
        if (supabaseEnabled && supabaseClient) {
            // Supabase: select top by score desc
            return supabaseClient.from('leaderboard').select('*').order('score', {ascending:false}).limit(limit).then(({data, error}) => {
                if (error) return Promise.reject(error);
                const rows = (data || []).map(d => ({
                    name: d.name || 'مشارك',
                    score: d.score || 0,
                    rank: d.rank || calculateCareerRank(d.score || 0),
                    createdAt: d.created_at ? new Date(d.created_at).getTime() : Date.now()
                }));
                return rows;
            });
        } else if (remoteEnabled && db) {
            return db.collection('leaderboard').orderBy('score', 'desc').limit(limit).get().then(snapshot => {
                const rows = [];
                snapshot.forEach(doc => {
                    const data = doc.data();
                    rows.push({
                        name: data.name || 'مشارك',
                        score: data.score || 0,
                        rank: data.rank || calculateCareerRank(data.score || 0),
                        createdAt: (data.createdAt && data.createdAt.toDate) ? data.createdAt.toDate().getTime() : Date.now()
                    });
                });
                return rows;
            });
        } else {
            // local
            try {
                const arr = JSON.parse(localStorage.getItem('local_leaderboard') || '[]');
                // already sorted when saved
                return Promise.resolve(arr.slice(0, limit));
            } catch (e) {
                return Promise.resolve([]);
            }
        }
    }

    // Render fetched rows into a container (by id). Handles both remote and local data.
    function renderTo(containerId, limit = 10) {
        const el = document.getElementById(containerId);
        if (!el) return Promise.resolve();
        el.innerHTML = '<div class="text-gray-400">جارٍ التحميل...</div>';
        // wait for initialization to complete (supabase import / firestore check)
        return ready.then(() => fetchTop(limit)).then(rows => {
            if (!rows || rows.length === 0) {
                // If configured, show a harmless demo seed on the start screen only
                const autoDemo = (typeof window.LEADERBOARD_AUTO_DEMO === 'undefined') ? true : !!window.LEADERBOARD_AUTO_DEMO;
                if (autoDemo && containerId === 'start-leaderboard-list') {
                    const demoRows = [
                        {name: 'StreamMaster', score: 98, rank: 'Stream Legend', createdAt: Date.now()},
                        {name: 'منتج_متميز', score: 88, rank: 'Prodigy', createdAt: Date.now() - 1000*60*60},
                        {name: 'مبتدئ', score: 60, rank: 'Director', createdAt: Date.now() - 1000*60*60*2}
                    ];
                    el.innerHTML = '';
                    demoRows.forEach(r => {
                        const item = document.createElement('div');
                        item.className = 'flex justify-between items-center gap-3';
                        const dateStr = new Date(r.createdAt || Date.now()).toLocaleString();
                        item.innerHTML = `<div class="text-left"><div class="font-semibold">${escapeHtml(r.name)} <span class="text-xs text-yellow-300">(عرض توضيحي)</span></div><div class="text-xs text-gray-300">${escapeHtml(r.rank)} • ${dateStr}</div></div><div class="text-blue-300 font-bold">${r.score}</div>`;
                        el.appendChild(item);
                    });
                    return;
                }
                el.innerHTML = '<div class="text-gray-400">لا توجد نتائج للعرض.</div>';
                return;
            }
            el.innerHTML = '';
            rows.forEach((r, idx) => {
                const item = document.createElement('div');
                item.className = 'flex justify-between items-center gap-3';
                const time = r.createdAt || r.ts || Date.now();
                const dateStr = new Date(time).toLocaleString();
                item.innerHTML = `<div class="text-left"><div class="font-semibold">${escapeHtml(r.name)}</div><div class="text-xs text-gray-300">${escapeHtml(r.rank)} • ${dateStr}</div></div><div class="text-blue-300 font-bold">${r.score}</div>`;
                el.appendChild(item);
            });
        }).catch(err => {
            console.error('Leaderboard render failed', err);
            el.innerHTML = '<div class="text-red-400">فشل جلب المتصدرين.</div>';
        });
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>"']/g, function (s) {
            return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[s];
        });
    }

    // ----- Supabase-backed Questions CRUD (only available when Supabase is enabled) -----
    async function fetchQuestions() {
        // Ensure backend initialization has completed (supabase import / firestore check)
        await ready;
        if (supabaseEnabled && supabaseClient) {
            return supabaseClient.from('questions').select('*').order('created_at', {ascending:false}).then(({data, error}) => {
                if (error) return Promise.reject(error);
                return (data || []).map(d => ({
                    id: d.id,
                    question: d.question,
                    options: d.options,
                    correct: d.correct,
                    hint: d.hint,
                    created_at: d.created_at
                }));
            });
        }
        return Promise.reject(new Error('Supabase not configured'));
    }

    async function createQuestion(obj) {
        // obj: {question, options (array), correct (int), hint}
        await ready;
        if (supabaseEnabled && supabaseClient) {
            return supabaseClient.from('questions').insert([{
                question: obj.question,
                options: obj.options,
                correct: obj.correct,
                hint: obj.hint
            }]).then(({data, error}) => {
                if (error) return Promise.reject(error);
                return data && data[0];
            });
        }
        return Promise.reject(new Error('Supabase not configured'));
    }

    async function updateQuestion(id, obj) {
        await ready;
        if (supabaseEnabled && supabaseClient) {
            return supabaseClient.from('questions').update(obj).eq('id', id).then(({data, error}) => {
                if (error) return Promise.reject(error);
                return data && data[0];
            });
        }
        return Promise.reject(new Error('Supabase not configured'));
    }

    async function deleteQuestion(id) {
        await ready;
        if (supabaseEnabled && supabaseClient) {
            return supabaseClient.from('questions').delete().eq('id', id).then(({data, error}) => {
                if (error) return Promise.reject(error);
                return data;
            });
        }
        return Promise.reject(new Error('Supabase not configured'));
    }

    // expose API
    window.leaderboard = {
        init: function(cfg) {
            // optional runtime init
            if (cfg) {
                Object.assign(firebaseConfig, cfg);
                if (typeof firebase !== 'undefined' && !remoteEnabled) {
                    try {
                        if (!firebase.apps || firebase.apps.length === 0) firebase.initializeApp(firebaseConfig);
                        db = firebase.firestore();
                        remoteEnabled = true;
                    } catch (e) {
                        console.error('Leaderboard init failed with provided config', e);
                    }
                }
            }
        },
        submitScore,
        fetchTop,
        calculateCareerRank,
        renderTo,
        // Supabase-backed question CRUD
        fetchQuestions,
        createQuestion,
        updateQuestion,
        deleteQuestion,
        // expose readiness promise so callers can wait for async backend initialization
        ready
    };
})();
