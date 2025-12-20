// src/features/student/components/enrollment/TimeslotPickerModal.jsx
import React, { useEffect, useState } from 'react';
import Modal from '@/common/components/ui/Modal.jsx';
import api from '@/common/api/client';
import { suggestTimeslots, getEnrollmentTimeslots } from '@/features/student/api/studentEnrollmentApi.js';
import { alertError } from '@/common/ui/alert.js';

const DAY_LABELS = { 1: '월', 2: '화', 3: '수', 4: '목', 5: '금', 6: '토', 7: '일' };
const safeError = (t, m) => Promise.resolve(alertError(t, m)).catch(() => {});

function toHHmm(v) {
    if (!v) return '-';
    if (typeof v === 'string') {
        if (/^\d{2}:\d{2}(:\d{2})?$/.test(v)) return v.slice(0, 5);
        const m = v.match(/T?(\d{2}:\d{2})(:\d{2})?/);
        return m ? m[1] : v;
    }
    try {
        const d = new Date(v);
        if (!isNaN(d)) {
            const h = String(d.getHours()).padStart(2, '0');
            const m = String(d.getMinutes()).padStart(2, '0');
            return `${h}:${m}`;
        }
    } catch {}
    return String(v);
}

export default function TimeslotPickerModal({
                                                title = '타임슬롯 선택',
                                                studentId,
                                                classId,
                                                locCode,
                                                stage,
                                                gradeCode,
                                                enrollmentId,
                                                onClose,
                                                onSubmit,
                                            }) {
    const [loading, setLoading] = useState(false);
    const [rows, setRows] = useState([]);               // 후보(해당 반의 전체 타임슬롯)
    const [selected, setSelected] = useState(new Set()); // 내가 선택한 것
    const [occupied, setOccupied] = useState(new Set()); // 다른 수업과 겹쳐서 선택 불가한 것

    // 초기 로딩: 후보 조회 + 기선택 조회 + 점유 조회
    useEffect(() => {
        let alive = true;
        const loadAll = async () => {
            setLoading(true);
            try {
                // 1. 해당 반의 전체 타임슬롯 (후보)
                const candidates = await suggestTimeslots({
                    loc: locCode,
                    stage: stage,
                    limit: 200
                });
                const classSlots = (candidates || []).filter(c => Number(c.classId) === Number(classId));

                classSlots.sort((a,b) => {
                    const da = Number(a.dayOfWeek), db = Number(b.dayOfWeek);
                    if(da !== db) return da - db;
                    return String(a.startTime).localeCompare(String(b.startTime));
                });

                // 2. 내 현재 선택값 (수정 모드일 때)
                let myIds = [];
                if (enrollmentId) {
                    const ids = await getEnrollmentTimeslots(enrollmentId);
                    myIds = ids.map(Number);
                }

                // 3. 학생의 다른 수업 점유 상황 조회 (ACTIVE 상태인 것만)
                // ✅ excludeEnrollId 파라미터 추가하여 내 시간표는 충돌에서 제외
                const occupiedRes = await api.get(`/admin/students/${studentId}/occupied-timeslots`, {
                    params: { excludeEnrollId: enrollmentId }
                });
                const allOccupiedIds = (occupiedRes.data || []).map(Number);

                if (!alive) return;

                setRows(classSlots);
                setSelected(new Set(myIds));
                setOccupied(new Set(allOccupiedIds)); // 이미 내꺼 제외하고 받아왔으므로 그대로 사용

            } catch (e) {
                console.error(e);
                safeError('오류', '타임슬롯 정보를 불러오지 못했습니다.');
            } finally {
                if (alive) setLoading(false);
            }
        };

        loadAll();
        return () => { alive = false; };
    }, [classId, studentId, enrollmentId, locCode, stage]);


    // 선택 토글
    const toggle = (id) => {
        if (occupied.has(id)) return;
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // 같은 요일 그룹 토글
    const toggleGroup = (row) => {
        const day = Number(row.dayOfWeek);
        const groupIds = rows
            .filter(r => Number(r.dayOfWeek) === day && !occupied.has(Number(r.timeslotId)))
            .map(r => Number(r.timeslotId));

        if (groupIds.length === 0) return;

        setSelected(prev => {
            const next = new Set(prev);
            const allSelected = groupIds.every(id => next.has(id));

            if (allSelected) groupIds.forEach(id => next.delete(id));
            else groupIds.forEach(id => next.add(id));
            return next;
        });
    };

    const selectedCount = selected.size;
    const thPad = { padding: '8px 12px', textAlign: 'left' };
    const tdPad = { padding: '8px 12px', verticalAlign: 'middle' };

    return (
        <Modal title={title} onClose={onClose} size="lg">
            <div className="space-y-4 min-h-[300px] flex flex-col">
                <div className="bg-slate-800/50 p-3 rounded border border-slate-700 text-sm text-slate-300">
                    <ul className="list-disc pl-4 space-y-1">
                        <li>체크박스를 클릭하여 수강할 시간표를 선택하세요.</li>
                        <li><b className="text-indigo-400">체크박스</b>를 누르면 <b>해당 요일의 모든 수업</b>이 선택됩니다.</li>
                        <li><span className="text-red-400">회색(비활성)</span> 항목은 이미 다른 반 수업과 겹치는 시간입니다.</li>
                    </ul>
                </div>

                <div className="flex-1 overflow-y-auto border border-slate-700 rounded-lg max-h-[50vh]">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-400 uppercase bg-slate-800 sticky top-0 z-10">
                        <tr>
                            <th style={{...thPad, width:'40px'}}></th>
                            <th style={thPad}>요일</th>
                            <th style={thPad}>시간</th>
                            <th style={thPad}>과목 / 반</th>
                            <th style={thPad}>상태</th>
                        </tr>
                        </thead>
                        <tbody>
                        {loading && <tr><td colSpan={5} className="py-8 text-center">로딩 중...</td></tr>}
                        {!loading && rows.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-slate-500">선택 가능한 시간표가 없습니다.</td></tr>}

                        {!loading && rows.map(r => {
                            const id = Number(r.timeslotId);
                            const isOcc = occupied.has(id);
                            const isSel = selected.has(id);
                            const dayStr = DAY_LABELS[r.dayOfWeek] || '-';
                            const timeStr = r.classTimeLabel || toHHmm(r.startTime);

                            return (
                                <tr key={id} className={`border-b border-slate-700/50 ${isOcc ? 'bg-slate-900/50 opacity-50' : 'hover:bg-slate-700/30'}`}>
                                    <td style={tdPad} className="text-center">
                                        <input
                                            type="checkbox"
                                            checked={isSel}
                                            disabled={isOcc}
                                            onChange={() => toggleGroup(r)}
                                            className="w-4 h-4 rounded border-slate-600 text-indigo-600 focus:ring-indigo-500 bg-slate-700 cursor-pointer disabled:cursor-not-allowed"
                                        />
                                    </td>
                                    <td style={tdPad} className="font-medium text-slate-200">{dayStr}</td>
                                    <td style={tdPad} className="font-mono text-slate-300">{timeStr}</td>
                                    <td style={tdPad}>
                                        <div className="font-medium text-indigo-300">{r.subjectName}</div>
                                        <div className="text-xs text-slate-500">{r.className}</div>
                                    </td>
                                    <td style={tdPad}>
                                        {isOcc ? <span className="text-red-400 text-xs font-bold">중복</span> :
                                            isSel ? <span className="text-indigo-400 text-xs font-bold">선택됨</span> :
                                                <span className="text-slate-600 text-xs">-</span>}
                                    </td>
                                </tr>
                            );
                        })}
                        </tbody>
                    </table>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-slate-700">
                    <div className="text-sm text-slate-400">
                        선택됨: <span className="text-indigo-400 font-bold">{selected.size}</span> 개
                    </div>
                    <div className="flex gap-2">
                        <button className="aa-btn" onClick={onClose}>취소</button>
                        <button className="aa-btn aa-btn-primary" onClick={() => onSubmit(Array.from(selected).map(Number))}>
                            저장
                        </button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}