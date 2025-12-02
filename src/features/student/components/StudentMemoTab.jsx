// src/features/student/components/StudentMemoTab.jsx
// ============================================================================
// StudentMemoTab — 메모 탭 전용(내부 로딩)
//  - 목록 로드/정렬(핀 우선, 최신 순)
//  - 등록/핀 토글/수정/삭제
//  - 부모 편집모드일 때 잠금(disabled)
// ----------------------------------------------------------------------------
// 추가 변경(이 이슈 해결 목적)
//  - props 추가: reloadTick, onChanged
//    • reloadTick: 부모가 증가시켜 외부에서 강제 새로고침 트리거
//    • onChanged:  내부 변경(등록/핀/수정/삭제) 성공 시 부모에 통지
//  - useEffect 의존성에 reloadTick 포함 → 외부 트리거를 감지해 load() 실행
//  - add/update/pin/delete 성공 시 onChanged?.(<event>) 호출
// ============================================================================

import React, { useEffect, useState } from 'react';
import Swal from 'sweetalert2';

import {
    listStudentMemos, addStudentMemo, updateStudentMemo, deleteStudentMemo,
} from '@/features/student/api/studentMemoApi.js';

import { alertError, alertInfo, alertSuccess } from '@/common/ui/alert.js';

const safeInfo  = (t,m)=>Promise.resolve(alertInfo(t,m)).catch(()=>{});
const safeOk    = (t,m)=>Promise.resolve(alertSuccess(t,m)).catch(()=>{});
const safeError = (t,m)=>Promise.resolve(alertError(t,m)).catch(()=>{});

const themeColor = '#4f46e5';
const commonHooks = {
    willOpen: () => { document.body.classList.add('modal-open'); },
    didClose: () => { document.body.classList.remove('modal-open'); }
};

async function textareaDialog({ title='내용 입력', text='', placeholder='', defaultValue='', validate } = {}){
    const r = await Swal.fire({
        title, text, input: 'textarea', inputValue: defaultValue,
        inputPlaceholder: placeholder, inputLabel: undefined,
        confirmButtonText: '저장', cancelButtonText: '취소',
        showCancelButton: true, confirmButtonColor: themeColor,
        reverseButtons: true, focusCancel: true,
        inputValidator: (v)=> validate?.(v) || undefined,
        didOpen: () => { const el = Swal.getHtmlContainer(); if (el) el.style.whiteSpace='pre-line'; },
        ...commonHooks
    });
    return r.isConfirmed ? (r.value ?? '') : null;
}

export default function StudentMemoTab({
                                           studentId,
                                           disabled=false,
                                           // -------------------------------
                                           // [메모 연동] 외부 리로드 트리거용 tick
                                           // -------------------------------
                                           reloadTick=0,
                                           // -------------------------------
                                           // [메모 연동] 변경 발생 시 부모 통지 콜백
                                           //  - onChanged('added'|'updated'|'deleted'|'pinned')
                                           // -------------------------------
                                           onChanged
                                       }){
    const [memos, setMemos]   = useState([]);
    const [memoText, setMemoText] = useState('');
    const [loading, setLoading]   = useState(false);

    const load = async ()=>{
        if(!studentId){ setMemos([]); return; }
        setLoading(true);
        try{
            const ms = await listStudentMemos(studentId, { page:0, size:50 });
            const memoRows = Array.isArray(ms)?ms:(ms?.content||[]);
            memoRows.sort((a,b)=>
                (Number(b.pinned)-Number(a.pinned)) ||
                String(b.createdAt||b.createdDate||'').localeCompare(String(a.createdAt||a.createdDate||''))
            );
            setMemos(memoRows);
        }catch{ setMemos([]); }
        finally{ setLoading(false); }
    };

    // ------------------------------------------------------------
    // studentId 변경 시 + 외부에서 reloadTick 증가 시 목록 재조회
    // ------------------------------------------------------------
    useEffect(()=>{ load(); },[studentId, reloadTick]);

    const addMemo = async ()=>{
        const txt = (memoText ?? '').trim();
        if (!studentId) return;
        if (!txt) return safeInfo('안내', '메모 내용을 입력하세요.');
        try{
            await addStudentMemo(studentId, { content: txt });
            setMemoText('');
            await safeOk('성공', '메모가 저장되었습니다.');
            await load();
            // [메모 연동] 부모에 변경 통지 → 부모가 detail.memo 재조회
            onChanged?.('added');
        }catch(e){
            safeError('오류', e?.response?.data?.message || '메모 저장 실패');
        }
    };

    return (
        <div className="space-y-3">
            <div className="flex items-start gap-2">
        <textarea
            className="aa-textarea flex-1"
            rows={3}
            placeholder={disabled ? '편집 모드에서는 메모 입력이 잠겨 있습니다.' : '메모를 입력하세요…'}
            value={memoText}
            onChange={e=>setMemoText(e.target.value)}
            disabled={disabled}
        />
                <button
                    className="aa-btn aa-btn-primary"
                    onClick={()=> disabled ? safeInfo('안내','편집 모드에서는 메모를 등록할 수 없습니다.') : addMemo()}
                    aria-label="메모 등록"
                    disabled={disabled}
                >
                    등록
                </button>
            </div>
            {disabled && (
                <div className="text-xs text-slate-400">편집 모드에서는 메모 등록/수정/삭제가 잠깁니다. 저장을 마친 뒤 다시 시도하세요.</div>
            )}

            <div className="aa-table-wrap memo-table-wrap">
                <table className="aa-table memo-table">
                    <thead>
                    <tr>
                        <th className="date-col">일시</th>
                        <th>내용</th>
                        <th style={{width:220}}></th>
                    </tr>
                    </thead>
                    <tbody>
                    {loading && <tr><td colSpan={3}>불러오는 중…</td></tr>}
                    {!loading && memos.length===0 && (
                        <tr><td colSpan={3}>등록된 메모가 없습니다.</td></tr>
                    )}
                    {memos.map(m=>(
                        <tr key={m.id}>
                            <td className="aa-cell-mono date-col">{m.createdAt || m.createdDate || '-'}</td>
                            <td className="content-col">
                                <div className="memo-text">
                                    {m.pinned ? '📌 ' : ''}{m.content}
                                </div>
                            </td>
                            <td className="text-right">
                                <div className="aa-actions">
                                    <button
                                        className="aa-btn aa-btn-sm"
                                        disabled={disabled}
                                        onClick={async ()=>{
                                            if (disabled) return safeInfo('안내','편집 모드에서는 핀을 변경할 수 없습니다.');
                                            try{
                                                await updateStudentMemo(studentId, m.id, { pinned: !m.pinned });
                                                await load();
                                                // [메모 연동] 부모 통지(요약메모 갱신 유도)
                                                onChanged?.('pinned');
                                            }catch(e){ safeError('오류', e?.response?.data?.message || '핀 변경 실패'); }
                                        }}
                                    >
                                        {m.pinned?'핀 해제':'핀 고정'}
                                    </button>
                                    <button
                                        className="aa-btn aa-btn-sm"
                                        disabled={disabled}
                                        onClick={async ()=>{
                                            if (disabled) return safeInfo('안내','편집 모드에서는 메모를 수정할 수 없습니다.');
                                            const next = await textareaDialog({
                                                title: '메모 수정',
                                                text: '내용을 수정하세요.',
                                                defaultValue: m.content || '',
                                                validate: (v)=> (String(v||'').trim() ? null : '내용을 입력하세요.')
                                            });
                                            if (next == null) return;
                                            const content = (next||'').trim();
                                            try{
                                                await updateStudentMemo(studentId, m.id, { content });
                                                await load();
                                                // [메모 연동] 부모 통지
                                                onChanged?.('updated');
                                            }catch(e){ safeError('오류', e?.response?.data?.message || '수정 실패'); }
                                        }}
                                    >수정</button>
                                    <button
                                        className="aa-btn aa-btn-danger aa-btn-sm"
                                        disabled={disabled}
                                        onClick={async ()=>{
                                            if (disabled) return safeInfo('안내','편집 모드에서는 메모를 삭제할 수 없습니다.');
                                            const ok = await Swal.fire({
                                                title:'확인', text:'메모를 삭제할까요?',
                                                showCancelButton:true, confirmButtonText:'삭제', cancelButtonText:'취소',
                                                confirmButtonColor:'#ef4444', reverseButtons:true, ...commonHooks
                                            }).then(r=>r.isConfirmed);
                                            if(!ok) return;
                                            try{
                                                await deleteStudentMemo(studentId, m.id);
                                                await load();
                                                // [메모 연동] 부모 통지
                                                onChanged?.('deleted');
                                            }catch(e){ safeError('오류', e?.response?.data?.message || '삭제 실패'); }
                                        }}
                                    >삭제</button>
                                </div>
                            </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}