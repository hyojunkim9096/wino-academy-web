// src/router/DynamicMenuRenderer.jsx
import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getMyMenus } from '@/api/menuApi';             // ⬅️ 변경: getMenuTree → getMyMenus
import { resolveComponentByKey } from '@/router/dynamicRegistry';

export default function DynamicMenuRenderer() {
    const location = useLocation();
    const pathname = useMemo(() => normalizePath(location.pathname), [location.pathname]);

    const [node, setNode] = useState(null);
    const [Comp, setComp] = useState(null);
    const [err, setErr] = useState(null);

    useEffect(() => {
        let alive = true;
        (async ()=>{
            try{
                setErr(null); setNode(null); setComp(null);
                const tree = await getMyMenus('ADMIN');          // ⬅️ 권한 필터된 트리
                const flat = flatten(tree);
                const hit  = flat.find(n => normalizePath(n.path) === pathname);
                if (!alive) return;

                if (!hit || !hit.componentKey) {
                    setNode(null); setComp(null);
                    return;
                }

                const C = await resolveComponentByKey(hit.componentKey);
                if (!alive) return;
                setNode(hit); setComp(()=>C);
            }catch(e){
                if (!alive) return; setErr(e);
            }
        })();
        return ()=>{ alive=false; };
    }, [pathname]);

    if (err) return <ErrorView error={err} />;
    if (!Comp) return <NotFound />;

    return (
        <Suspense fallback={<LoadingView />}>
            <Comp />
        </Suspense>
    );
}

/* -------------- utils -------------- */
function flatten(nodes=[]){
    const out = [];
    const walk = (arr=[])=>{
        arr.forEach(n=>{
            out.push(n);
            if (n.children?.length) walk(n.children);
        });
    };
    walk(nodes);
    return out;
}
function normalizePath(p) { return ('/' + (p||'')).replace(/\/+/g,'/').replace(/\/$/,'') || '/'; }

/* -------------- 뷰들 -------------- */
function Panel({ children }) {
    return (
        <section className="p-6">
            <div className="border border-slate-800 rounded-xl p-5 bg-slate-900 text-slate-100">
                {children}
            </div>
        </section>
    );
}
function LoadingView() { return <Panel>화면 불러오는 중…</Panel>; }
function NotFound()    { return <Panel>등록된 화면이 없습니다. (DB 매핑 없음 또는 componentKey 누락)</Panel>; }
function ErrorView({ error }) { return <Panel>로드 오류: {String(error?.message || '알 수 없는 오류')}</Panel>; }
