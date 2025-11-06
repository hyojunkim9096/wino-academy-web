// src/features/admin/pages/RoomManagePage.jsx
// ============================================================================
// 강의실 관리(등록/수정) + 강의실 배정 통합 페이지 (v6.4.3-swal)
//  - Topbar 2줄 강제
//  - RESET: 페이지 진입 시 기억 안 함(공통코드 로딩 후 첫 코드 자동 선택)
//  - 수정/배정 UX 기존 유지
//  - ★ NEW: 정렬 모드(순서 편집) + 순서 저장 (/admin/rooms/reorder)
//  - ★ FIX: 이름 컬럼 가변폭 + ▲▼ 버튼을 이름 앞 인라인 배치(긴 이름도 보이도록)
//  - ★ FIX: 정렬모드 해제 시, 저장하지 않았다면 스냅샷으로 즉시 원복 + 확인 대화상자
//  - ★ FIX: "순서 저장" 직후 정렬모드 해제할 때 확인창이 또 뜨는 문제 제거
//  - ★ COMPAT: SweetAlert2 confirmDialog 우선 사용 + 레거시 confirm 계열 자동 감지
//              (alertConfirm/confirm/confirmAlert) → 실패 시 window.confirm 폴백
//  - ✅ Modal.jsx(v2) 대응: 모달 폭은 size 프리셋 사용(등록/수정=lg, 조회=2xl)
// ============================================================================

import React, { useEffect, useMemo, useState } from "react";

// ✅ 공통 알림 모듈
//    - alertSuccess/alertError/alertInfo: 그대로 사용
//    - 확인 다이얼로그: 아래 askConfirm 래퍼를 통해 일관 호출
import * as Alerts from "@/ui/alert";
const { alertSuccess, alertError, alertInfo } = Alerts;

/**
 * ✅ 확인 다이얼로그 공통 래퍼
 * 우선순위:
 *   1) Alerts.confirmDialog(title, text, opts)  ← SweetAlert2 래퍼
 *   2) Alerts.alertConfirm/confirm/confirmAlert(객체) 시그니처
 *   3) Alerts.alertConfirm/confirm/confirmAlert(title, message) 시그니처
 *   4) window.confirm(message) 폴백
 *
 * 반환을 boolean으로 정규화(true/false, {ok|confirmed|value} 등)
 */
const askConfirm = async (message, opts = {}) => {
    // (1) SweetAlert2 래퍼(confirmDialog) 가 있으면 최우선 사용
    if (typeof Alerts.confirmDialog === "function") {
        const ok = await Alerts.confirmDialog(
            opts.title ?? "확인",
            message,
            {
                confirmText: opts.okText ?? "확인",
                cancelText: opts.cancelText ?? "취소",
                // danger 옵션이면 확정 버튼 색상만 강조 (나머지는 alert.js 기본값 사용)
                ...(opts.danger ? { confirmColor: "#ef4444" } : {}),
            }
        );
        return !!ok;
    }

    // (2) 레거시 confirm 계열 자동 감지
    const legacy = Alerts.alertConfirm ?? Alerts.confirm ?? Alerts.confirmAlert;
    if (typeof legacy === "function") {
        try {
            // (2-A) 객체 시그니처 지원
            const r = await legacy({
                title: opts.title ?? "확인",
                message,
                okText: opts.okText ?? "확인",
                cancelText: opts.cancelText ?? "취소",
                danger: !!opts.danger,
            });
            if (typeof r === "object") return !!(r.ok ?? r.confirmed ?? r.value);
            return !!r;
        } catch {
            try {
                // (2-B) (title, message) 시그니처 지원
                const r2 = await legacy(opts.title ?? "확인", message);
                if (typeof r2 === "object") return !!(r2.ok ?? r2.confirmed ?? r2.value);
                return !!r2;
            } catch {
                // ignore → 폴백
            }
        }
    }

    // (3) 최종 폴백: 브라우저 confirm
    return window.confirm(message);
};

// ✅ 강의실 조회(그리드) 모달
import RoomGridModal from "@/features/admin/components/RoomGridModal";

// ✅ 공통코드 API
import { getCodes } from "@/api/commonCodeAdminApi";

// ✅ 강의실 API
import {
    listRooms,
    createRoom,
    updateRoom,
    toggleRoomUse,
    getRoomAssignPreview,
    postRoomAssign,
    reorderRooms, // 지점 내 정렬 저장
} from "@/api/roomAdminApi";

// ✅ 이 페이지 전용 스타일
import "@/styles/admin-academy.css";
import "@/styles/admin-system.css";
import "@/styles/admin-room.css";

// ✅ 공통 모달
import Modal from "@/components/ui/Modal";

/* ----------------------------------------------------------------------------
 * 유틸
 * ------------------------------------------------------------------------- */

/** 숫자 파싱(실패 시 기본값) */
const toIntOr = (v, d = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
};

/** 공통코드 enabled 판정 (boolean/number/string 혼용 대응) */
function isEnabledCode(item) {
    const v = item?.enabled;
    if (v === undefined || v === null) return true;
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v === 1;
    const s = String(v).trim().toLowerCase();
    return s === "1" || s === "true" || s === "y";
}

/* ----------------------------------------------------------------------------
 * 공통코드 로딩 훅
 * ------------------------------------------------------------------------- */
function useClassTimeCodes() {
    const [classTimes, setClassTimes] = useState([]);
    useEffect(() => {
        (async () => {
            try {
                const list = await getCodes("CLASS_TIME");
                const filtered = (list || []).filter(isEnabledCode);
                setClassTimes(filtered);
            } catch {
                setClassTimes([]);
            }
        })();
    }, []);
    return classTimes;
}

function useWorkLocationCodes() {
    const [workCodes, setWorkCodes] = useState([]);
    useEffect(() => {
        (async () => {
            try {
                const list = await getCodes("WORK_LOCATION");
                const filtered = (list || []).filter(isEnabledCode);
                setWorkCodes(filtered);
            } catch {
                setWorkCodes([]);
            }
        })();
    }, []);
    return workCodes;
}

/* ----------------------------------------------------------------------------
 * 메인 페이지
 * ------------------------------------------------------------------------- */
export default function RoomManagePage() {
    // ──────────────────────────────────────────────────────────────
    // 상단 상태(RESET: 기본값만, 기억/복구 없음)
    // ──────────────────────────────────────────────────────────────
    const [work, setWork] = useState(""); // 관(지점) 코드
    const [dow, setDow] = useState(1); // 월(1)~일(7)
    const classTimeCodes = useClassTimeCodes();
    const [tcode, setTcode] = useState(""); // CLASS_TIME 코드

    // WORK_LOCATION 로드 → 첫 코드 자동 선택(초기 1회)
    const workCodes = useWorkLocationCodes();
    useEffect(() => {
        if (!work && workCodes.length) setWork(String(workCodes[0].code ?? ""));
    }, [work, workCodes]);

    // CLASS_TIME 로드 → 첫 코드 자동 선택(초기 1회)
    useEffect(() => {
        if (!tcode && classTimeCodes.length) setTcode(String(classTimeCodes[0].code ?? ""));
    }, [classTimeCodes, tcode]);

    // 관 코드/이름 매핑(표시용) — 필요시 표시용으로 사용
    const workNameMap = useMemo(() => {
        const m = {};
        for (const w of workCodes) if (w?.code) m[w.code] = w.name || w.code;
        return m;
    }, [workCodes]);

    // ──────────────────────────────────────────────────────────────
    // 관별 등록 현황(상단 뱃지)
    // ──────────────────────────────────────────────────────────────
    const [workStats, setWorkStats] = useState([]); // [{code,name,total}]
    const refreshWorkStats = async () => {
        if (!workCodes.length) return setWorkStats([]);
        const stats = await Promise.all(
            workCodes.map(async (wc) => {
                try {
                    const res = await listRooms({ workLocationCode: wc.code, page: 1, size: 1 });
                    return { code: wc.code, name: wc.name || wc.code, total: res?.total || 0 };
                } catch {
                    return { code: wc.code, name: wc.name || wc.code, total: 0 };
                }
            })
        );
        setWorkStats(stats);
    };
    useEffect(() => {
        refreshWorkStats();
    }, [workCodes]);

    // ──────────────────────────────────────────────────────────────
    // 좌측 목록/검색 (+ 정렬 모드)
    // ──────────────────────────────────────────────────────────────
    const [keyword, setKeyword] = useState("");
    const [page, setPage] = useState(1);
    const [size, setSize] = useState(20); // 기본 20, 정렬 모드에서는 크게
    const [roomPage, setRoomPage] = useState({ items: [], total: 0, page: 1, size: 20 });

    // NEW: 정렬 모드
    const [reorderMode, setReorderMode] = useState(false);
    const [orderDirty, setOrderDirty] = useState(false); // 정렬 변경 여부(미저장)

    // ★ 스냅샷: 정렬 모드 진입 시점의 '원래 순서' 저장 → 저장 안 하고 나갈 때 원복
    const [reorderSnapshot, setReorderSnapshot] = useState([]); // Row[]

    // 등록/수정 모달 폼
    const blankForm = useMemo(
        () => ({
            id: null,
            workLocationCode: "",
            code: "",
            name: "",
            capacity: "",
            maxParallel: 1,
            status: "OPEN",
            memo: "",
            useYn: "1",
        }),
        []
    );
    const [form, setForm] = useState(blankForm);
    const [modalOpen, setModalOpen] = useState(false);
    const [isCreate, setIsCreate] = useState(true);
    const [browseOpen, setBrowseOpen] = useState(false); // 강의실 조회 모달

    /** 신규 등록 모달 열기 */
    const openCreateModal = () => {
        setForm({
            ...blankForm,
            workLocationCode: work || "",
            maxParallel: 1,
            status: "OPEN",
            useYn: "1",
        });
        setIsCreate(true);
        setModalOpen(true);
    };

    /** 수정 모달 열기 */
    const openEditModal = (row) => {
        setForm({
            id: row.id,
            workLocationCode: row.workLocationCode,
            code: row.code,
            name: row.name,
            capacity: row.capacity ?? "",
            maxParallel: row.maxParallel ?? 1,
            status: row.status ?? "OPEN",
            memo: row.memo ?? "",
            useYn: row.useYn ?? "1",
        });
        setIsCreate(false);
        setModalOpen(true);
    };

    // 목록 로딩 (일반/정렬 모드 공용)
    const fetchRoomList = async (override = {}) => {
        const workCode = override.workLocationCode ?? work;
        const useKeyword = Object.prototype.hasOwnProperty.call(override, "keyword")
            ? override.keyword
            : (reorderMode ? undefined : (keyword || undefined));

        if (!workCode) {
            setRoomPage({ items: [], total: 0, page: 1, size });
            return;
        }
        const req = {
            workLocationCode: workCode,
            keyword: useKeyword,
            page: override.page ?? page,
            size: override.size ?? size,
        };
        const res = await listRooms(req);
        setRoomPage(res || { items: [], total: 0, page: req.page, size: req.size });
        setOrderDirty(false); // 서버 재조회 시 미저장 플래그 초기화
    };

    useEffect(() => {
        fetchRoomList();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [work, keyword, page, size, reorderMode]);

    // ──────────────────────────────────────────────────────────────
    // 우측 PREVIEW(가용 + 시간표)
    // ──────────────────────────────────────────────────────────────
    const [roomsForAssign, setRoomsForAssign] = useState([]); // RoomUsage[]
    const [timeslots, setTimeslots] = useState([]); // TimeslotRow[]
    const [selRoomId, setSelRoomId] = useState(null);
    const [selTsIds, setSelTsIds] = useState(new Set());

    /** 배정 미리보기 로딩 */
    const fetchPreview = async () => {
        if (!work || !tcode || !dow) {
            setRoomsForAssign([]);
            setTimeslots([]);
            setSelRoomId(null);
            setSelTsIds(new Set());
            return;
        }
        const res = await getRoomAssignPreview({
            workLocationCode: work,
            dayOfWeek: dow,
            classTimeCode: tcode,
        });
        setRoomsForAssign(res?.rooms || []);
        setTimeslots(res?.timeslots || []);
        setSelRoomId(null);
        setSelTsIds(new Set());
    };
    useEffect(() => {
        fetchPreview();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [work, dow, tcode]);

    // 좌측 행 액션: 사용/미사용 토글
    const onToggleUse = async (row, newUse) => {
        try {
            await toggleRoomUse({ id: row.id, workLocationCode: row.workLocationCode, useYn: newUse });
            await fetchRoomList();
            await fetchPreview();
            await refreshWorkStats();
        } catch (e) {
            await alertError("실패", "사용 여부 변경에 실패했습니다.");
        }
    };

    // 저장 (생성/수정)
    const saveRoom = async () => {
        const wcode = isCreate ? (work || form.workLocationCode) : form.workLocationCode;
        if (!wcode?.trim()) return alertInfo("확인", "관(지점)을 선택/입력하세요.");
        if (!form.name?.trim()) return alertInfo("확인", "이름은 필수입니다.");
        if (isCreate && !form.code?.trim()) return alertInfo("확인", "신규 생성 시 코드는 필수입니다.");

        const payload = {
            workLocationCode: wcode.trim(),
            name: form.name.trim(),
            capacity: form.capacity === "" ? null : toIntOr(form.capacity, null),
            maxParallel: toIntOr(form.maxParallel || 1, 1),
            status: "OPEN",
            memo: form.memo || "",
            useYn: form.useYn || "1",
        };

        try {
            if (isCreate) {
                await createRoom({ ...payload, code: form.code.trim() });
            } else {
                await updateRoom(form.id, { id: form.id, ...payload });
            }
            await alertSuccess("저장 완료", "강의실 정보가 저장되었습니다.");
            setModalOpen(false);
            await fetchRoomList();
            await fetchPreview();
            await refreshWorkStats();
        } catch (e) {
            const data = e?.response?.data;
            const msg =
                (data && (data.message || data.error || JSON.stringify(data))) ||
                e.message ||
                "저장 중 오류가 발생했습니다.";
            await alertError("저장 실패", msg);
        }
    };

    // 배정/해제
    const selectedCount = selTsIds.size;
    const selectedRoom = useMemo(
        () => roomsForAssign.find((r) => r.roomId === selRoomId) || null,
        [roomsForAssign, selRoomId]
    );

    const toggleTimeslot = (tsId) => {
        const s = new Set(selTsIds);
        s.has(tsId) ? s.delete(tsId) : s.add(tsId);
        setSelTsIds(s);
    };

    const assignSelected = async () => {
        if (!selRoomId) return alertInfo("확인", "배정할 강의실을 선택하세요.");
        if (!selectedCount) return alertInfo("확인", "배정할 시간표를 선택하세요.");

        const items = Array.from(selTsIds).map((id) => ({ timeslotId: id, roomId: selRoomId }));
        try {
            // 1) dryRun (검증)
            await postRoomAssign({
                workLocationCode: work,
                dayOfWeek: dow,
                classTimeCode: tcode,
                dryRun: true,
                items,
            });
            // 2) 실제 반영
            const ack = await postRoomAssign({
                workLocationCode: work,
                dayOfWeek: dow,
                classTimeCode: tcode,
                dryRun: false,
                items,
            });
            await alertSuccess("배정 완료", `반영: ${ack?.updated ?? 0}건`);
            await fetchPreview();
        } catch (e) {
            const data = e?.response?.data;
            const msg =
                (data && (data.message || data.error || JSON.stringify(data))) ||
                e.message ||
                "배정 중 오류가 발생했습니다.";
            await alertError("배정 실패", msg);
        }
    };

    const clearSelected = async () => {
        if (!selectedCount) return alertInfo("확인", "해제할 시간표를 선택하세요.");
        const items = Array.from(selTsIds).map((id) => ({ timeslotId: id, roomId: null }));
        try {
            const ack = await postRoomAssign({
                workLocationCode: work,
                dayOfWeek: dow,
                classTimeCode: tcode,
                dryRun: false,
                items,
            });
            await alertSuccess("해제 완료", `해제: ${ack?.cleared ?? 0}건`);
            await fetchPreview();
        } catch (e) {
            const data = e?.response?.data;
            const msg =
                (data && (data.message || data.error || JSON.stringify(data))) ||
                e.message ||
                "해제 중 오류가 발생했습니다.";
            await alertError("해제 실패", msg);
        }
    };

    /* ────────────────────────────────────────────────────────────
     * 정렬 모드
     *  - 진입: 전체 로딩(size↑) + 스냅샷 저장
     *  - 이동: 로컬 state만 변경 (서버 전송 없음)
     *  - 저장: /admin/rooms/reorder
     *  - 해제: 저장 안 했으면 스냅샷 즉시 복구 + 확인창
     * ──────────────────────────────────────────────────────────── */
    const enterReorderMode = async () => {
        if (!work) return alertInfo("안내", "먼저 관(지점)을 선택하세요.");

        // 1) 정렬 모드 ON + 검색어 초기화
        setReorderMode(true);
        setOrderDirty(false);
        setKeyword("");
        setPage(1);

        // 2) 전체를 한 번에 로딩 (페이지 1, size 크게)
        const res = await listRooms({
            workLocationCode: work,
            keyword: undefined,
            page: 1,
            size: 2000,
        });

        // 3) 현재 목록과 '원래 순서 스냅샷' 저장
        setRoomPage(res || { items: [], total: 0, page: 1, size: 2000 });
        setReorderSnapshot(res?.items ? [...res.items] : []);

        // 4) size 상태 갱신(의존 useEffect 내 fetch와 일관성)
        setSize(2000);
    };

    /**
     * 정렬 모드 해제
     * @param {boolean} silent - true면 미저장 변경 확인창을 띄우지 않음(저장 직후 사용)
     */
    const exitReorderMode = async (silent = false) => {
        // 미저장 변경 확인(저장 직후(silent=true)에는 스킵)
        if (orderDirty && !silent) {
            const ok = await askConfirm("저장하지 않은 순서 변경이 있습니다. 변경을 취소하고 나갈까요?");
            if (!ok) return; // 취소 시 정렬 모드 유지
        }

        // (1) UI를 즉시 스냅샷으로 원복 (서버 응답 기다리지 않음)
        if (reorderSnapshot?.length) {
            setRoomPage((curr) => ({
                ...curr,
                items: [...reorderSnapshot],
            }));
        }

        // (2) 정렬 모드 OFF + 기본 페이지 사이즈 복귀
        setReorderMode(false);
        setOrderDirty(false);     // ★ 중요: 해제 시 미저장 플래그 초기화
        setReorderSnapshot([]);
        setSize(20);
        setPage(1);

        // (3) 서버 최신 정렬 순서 재조회 (다른 사용자의 변경 가능성 고려)
        await fetchRoomList({ page: 1, size: 20, keyword: undefined });
    };

    /** 목록에서 한 행 이동(위/아래) */
    const moveRow = (idx, dir) => {
        if (!reorderMode) return;
        setRoomPage((curr) => {
            const items = [...(curr.items || [])];
            const to = Math.max(0, Math.min(items.length - 1, idx + dir));
            if (to === idx) return curr;
            const [x] = items.splice(idx, 1);
            items.splice(to, 0, x);
            return { ...curr, items };
        });
        setOrderDirty(true); // 이동 시 미저장 변경 표시
    };

    /** 정렬 저장 */
    const saveRoomOrder = async () => {
        if (!reorderMode) return;
        if (!work) return;
        if (!roomPage.items?.length) return;

        const ids = roomPage.items.map((it) => it.id);
        try {
            await reorderRooms(work, ids);
            await alertSuccess("완료", "순서를 저장했습니다.");

            // 저장됨: 스냅샷을 현재 상태로 갱신 + 미저장 플래그 해제
            setReorderSnapshot([...roomPage.items]);
            setOrderDirty(false); // ★ 중요: 저장했으니 미저장 아님

            // 저장 후 정렬 모드 해제(확인창 건너뛰기) + 상단 뱃지 갱신
            await exitReorderMode(true); // ★ silent=true: 확인창 없이 종료
            await refreshWorkStats();
            // ✅ 우측 '강의실' 프리뷰(가용/배정 목록)도 최신 순서로 재조회
            await fetchPreview();
        } catch (e) {
            await alertError("실패", e?.response?.data?.message || "순서 저장에 실패했습니다.");
        }
    };

    // 페이징 계산
    const totalPages = useMemo(
        () => Math.max(1, Math.ceil((roomPage.total || 0) / size)),
        [roomPage, size]
    );

    // ──────────────────────────────────────────────────────────────
    // 렌더
    // ──────────────────────────────────────────────────────────────
    return (
        <div className="aa-page academy-page room-page">
            <div className="aa-container">
                {/* Topbar - 2줄 강제 */}
                <div
                    className="aa-toolbar aa-topbar"
                    style={{ display: "flex", flexWrap: "wrap", gap: ".75rem", alignItems: "flex-end" }}
                >
                    {/* 1줄: 제목 */}
                    <div className="aa-topbar-title" style={{ flex: "1 1 100%" }}>
                        <h1 className="aa-title">강의실 관리</h1>
                        {reorderMode && <div className="aa-subtle">정렬 모드: 지점 내 순서를 편집 중입니다.</div>}
                    </div>

                    {/* 2줄-좌: 관 뱃지 */}
                    <div className="aa-topbar-left" style={{ display: "flex", gap: 6, overflowX: "auto" }}>
                        {workStats.map((ws) => (
                            <button
                                key={ws.code}
                                className={`aa-btn aa-btn-sm ${work === ws.code ? "aa-btn-primary" : "aa-btn-outline"}`}
                                onClick={() => {
                                    setWork(ws.code);
                                    setPage(1);
                                }}
                                title={`${ws.name} 강의실 총 ${ws.total}개`}
                                style={{ whiteSpace: "nowrap" }}
                                disabled={reorderMode}
                            >
                                {ws.name} <span className="aa-badge" style={{ marginLeft: 6 }}>{ws.total}</span>
                            </button>
                        ))}
                    </div>

                    {/* 2줄-우: 요일/시간/새로고침/정렬 모드 */}
                    <div
                        className="aa-topbar-right"
                        style={{
                            marginLeft: "auto",
                            display: "flex",
                            alignItems: "center",
                            gap: ".5rem",
                            flexWrap: "wrap",
                        }}
                    >
                        {/* 요일 */}
                        <div className="aa-field">
                            <select
                                className="aa-select w-28"
                                value={dow}
                                onChange={(e) => setDow(toIntOr(e.target.value, 1))}
                                disabled={reorderMode}
                            >
                                <option value={1}>월요일</option>
                                <option value={2}>화요일</option>
                                <option value={3}>수요일</option>
                                <option value={4}>목요일</option>
                                <option value={5}>금요일</option>
                                <option value={6}>토요일</option>
                                <option value={7}>일요일</option>
                            </select>
                        </div>

                        {/* 시간코드 */}
                        <div className="aa-field">
                            {classTimeCodes.length ? (
                                <select
                                    className="aa-select w-40"
                                    value={tcode}
                                    onChange={(e) => setTcode(e.target.value)}
                                    disabled={reorderMode}
                                >
                                    {classTimeCodes.map((c) => (
                                        <option key={c.code} value={c.code}>
                                            {c.name}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <input
                                    className="aa-input w-36"
                                    placeholder="예: 1830"
                                    value={tcode}
                                    onChange={(e) => setTcode(e.target.value)}
                                    disabled={reorderMode}
                                />
                            )}
                        </div>

                        <button
                            className="aa-btn aa-btn-outline"
                            onClick={() => {
                                fetchRoomList();
                                fetchPreview();
                                refreshWorkStats();
                            }}
                            disabled={reorderMode}
                        >
                            새로고침
                        </button>

                        {!reorderMode ? (
                            <button className="aa-btn aa-btn-outline" onClick={enterReorderMode}>
                                순서 편집
                            </button>
                        ) : (
                            <>
                                {/* 저장 안 했으면 확인창(askConfirm)으로 가드, 저장 직후엔 silent 종료 사용 */}
                                <button className="aa-btn" onClick={() => exitReorderMode(false)}>
                                    정렬 모드 해제
                                </button>
                                <button className="aa-btn aa-btn-primary" disabled={!orderDirty} onClick={saveRoomOrder}>
                                    순서 저장
                                </button>
                            </>
                        )}

                        <button
                            className="aa-btn aa-btn-outline"
                            onClick={() => setBrowseOpen(true)}
                            title="관별 강의실 그리드 조회"
                            disabled={reorderMode}
                        >
                            강의실 조회
                        </button>
                    </div>
                </div>

                {/* 본문: 좌(목록) / 우(배정) */}
                <div
                    className="aa-split"
                    style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(320px, 0.3fr) minmax(520px, 0.7fr)",
                        gap: "1rem",
                        alignItems: "start",
                    }}
                >
                    {/* 좌: 강의실 목록 */}
                    <section className="aa-card aa-sticky-lg" aria-label="강의실 목록">
                        {/* 상단 액션/검색 */}
                        <div className="aa-row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
                            <div className="aa-field" style={{ minWidth: 240 }}>
                                <input
                                    className="aa-input"
                                    value={keyword}
                                    onChange={(e) => setKeyword(e.target.value)}
                                    placeholder="코드 또는 이름"
                                    disabled={reorderMode}
                                />
                            </div>
                            <div className="aa-btn-group" style={{ alignSelf: "flex-end" }}>
                                <button
                                    className="aa-btn aa-btn-outline aa-btn-sm"
                                    onClick={() => {
                                        setPage(1);
                                        fetchRoomList();
                                    }}
                                    disabled={reorderMode}
                                >
                                    검색
                                </button>
                                <button className="aa-btn aa-btn-primary aa-btn-sm" onClick={openCreateModal} disabled={reorderMode}>
                                    + 새 강의실
                                </button>
                            </div>
                        </div>

                        {/* 목록 테이블 */}
                        <div className="aa-table-wrap" style={{ marginTop: ".6rem" }}>
                            <table className="aa-table aa-table--lg">
                                {/* ✅ 이름 컬럼은 가변폭(폭 지정 X) → 긴 이름도 말줄임으로 자연 표시 */}
                                <colgroup>
                                    <col style={{ width: 100 }} />
                                    <col style={{ width: 80 }} />
                                    <col style={{ width: 80 }} />
                                    <col style={{ width: 100 }} />
                                    <col style={{ width: 220 }} />
                                </colgroup>
                                <thead>
                                <tr>
                                    <th>이름</th>
                                    <th className="text-center">정원</th>
                                    <th className="text-center">허용</th>
                                    <th>사용여부</th>
                                    <th style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                                        {reorderMode ? "" : "액션"}
                                    </th>
                                </tr>
                                </thead>
                                <tbody>
                                {(roomPage.items || []).map((row, idx) => (
                                    <tr key={row.id}>
                                        {/* ✅ 이름 셀: ▲▼ 버튼을 이름 앞 인라인 배치 + ellipsis 안정화 */}
                                        <td>
                                            <div className="name-cell" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                {reorderMode && (
                                                    <span className="tr-reorder inline" style={{ display: "inline-flex", gap: 6 }}>
                                                            <button
                                                                className="aa-btn aa-btn-sm"
                                                                onClick={() => moveRow(idx, -1)}
                                                                title="위로"
                                                            >
                                                                ▲
                                                            </button>
                                                            <button
                                                                className="aa-btn aa-btn-sm"
                                                                onClick={() => moveRow(idx, 1)}
                                                                title="아래로"
                                                            >
                                                                ▼
                                                            </button>
                                                        </span>
                                                )}
                                                <span
                                                    className="aa-ellipsis name-text"
                                                    style={{ minWidth: 0, flex: "1 1 auto" }}
                                                    title={row.name || row.code}
                                                >
                                                        {row.name ?? row.code ?? "-"}
                                                    </span>
                                            </div>
                                        </td>

                                        <td className="text-center">{row.capacity ?? "-"}</td>
                                        <td className="text-center">{row.maxParallel}</td>
                                        <td>
                                                <span className={`aa-badge ${row.useYn === "1" ? "" : "aa-badge--muted"}`}>
                                                    {row.useYn === "1" ? "사용" : "미사용"}
                                                </span>
                                        </td>

                                        {/* ✅ 정렬 모드일 때는 오른쪽 액션 컬럼 비움(시각 충돌 방지) */}
                                        <td className="aa-actions" style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                                            {!reorderMode ? (
                                                <span style={{ display: "inline-flex", gap: 6, verticalAlign: "middle" }}>
                                                        <button
                                                            className="aa-btn aa-btn-outline aa-btn-sm"
                                                            onClick={() => openEditModal(row)}
                                                        >
                                                            수정
                                                        </button>
                                                    {row.useYn === "1" ? (
                                                        <button
                                                            className="aa-btn aa-btn-sm"
                                                            onClick={() => onToggleUse(row, "0")}
                                                        >
                                                            미사용
                                                        </button>
                                                    ) : (
                                                        <button
                                                            className="aa-btn aa-btn-primary aa-btn-sm"
                                                            onClick={() => onToggleUse(row, "1")}
                                                        >
                                                            사용
                                                        </button>
                                                    )}
                                                    </span>
                                            ) : null}
                                        </td>
                                    </tr>
                                ))}
                                {!roomPage.items?.length && (
                                    <tr>
                                        <td colSpan={5} className="aa-subtle" style={{ textAlign: "center", padding: "1rem 0" }}>
                                            데이터 없음
                                        </td>
                                    </tr>
                                )}
                                </tbody>
                            </table>
                        </div>

                        {/* 페이징 */}
                        <div className="aa-row" style={{ justifyContent: "space-between", marginTop: ".6rem" }}>
                            <div className="aa-subtle">
                                {reorderMode ? (
                                    <>정렬 모드에서는 페이징이 비활성화됩니다. (총 {roomPage.items?.length || 0}개)</>
                                ) : (
                                    <>총 {roomPage.total}건</>
                                )}
                            </div>
                            {!reorderMode && (
                                <div className="aa-btn-group">
                                    <button className="aa-btn aa-btn-outline aa-btn-sm" disabled={page <= 1} onClick={() => setPage(1)}>
                                        ≪
                                    </button>
                                    <button
                                        className="aa-btn aa-btn-outline aa-btn-sm"
                                        disabled={page <= 1}
                                        onClick={() => setPage((p) => p - 1)}
                                    >
                                        〈
                                    </button>
                                    <span className="aa-subtle">page {page}/{totalPages}</span>
                                    <button
                                        className="aa-btn aa-btn-outline aa-btn-sm"
                                        disabled={page >= totalPages}
                                        onClick={() => setPage((p) => p + 1)}
                                    >
                                        〉
                                    </button>
                                    <button
                                        className="aa-btn aa-btn-outline aa-btn-sm"
                                        disabled={page >= totalPages}
                                        onClick={() => setPage(totalPages)}
                                    >
                                        ≫
                                    </button>
                                </div>
                            )}
                        </div>
                    </section>

                    {/* 우: 강의실 배정 */}
                    <section className="aa-card" aria-label="강의실 배정">
                        {/* 상단 설명 + 액션 */}
                        <div className="aa-row" style={{ justifyContent: "space-between", marginBottom: ".4rem" }}>
                            <div>
                                <h3 className="aa-title--sm">강의실 배정</h3>
                            </div>
                            <div className="aa-btn-group">
                                <button className="aa-btn aa-btn-outline" onClick={clearSelected} disabled={reorderMode}>
                                    선택 해제(NULL)
                                </button>
                                <button className="aa-btn aa-btn-primary" onClick={assignSelected} disabled={reorderMode}>
                                    선택 배정
                                </button>
                            </div>
                        </div>

                        {/* 좌: 방 / 우: 시간표 */}
                        <div
                            className="aa-split"
                            style={{
                                gridTemplateColumns: "minmax(280px, 0.42fr) minmax(420px, 0.58fr)",
                                gap: "10px",
                            }}
                        >
                            {/* 좌: 방 가용 현황 */}
                            <section className="aa-panel tight" style={{ minHeight: "360px" }}>
                                <div className="aa-row" style={{ justifyContent: "space-between", marginBottom: ".4rem" }}>
                                    <h4 className="aa-title--sm">강의실</h4>
                                    <span className="aa-subtle">가용 = 허용 - 배정</span>
                                </div>
                                <ul
                                    className="room-list"
                                    style={{
                                        maxHeight: "60vh",
                                        overflow: "auto",
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: ".4rem",
                                    }}
                                >
                                    {roomsForAssign.map((r) => (
                                        <li key={r.roomId}>
                                            <button
                                                className={`room-item ${selRoomId === r.roomId ? "room-item--active" : ""}`}
                                                style={{ width: "100%", justifyContent: "space-between" }}
                                                onClick={() => setSelRoomId(r.roomId)}
                                                disabled={reorderMode}
                                            >
                                                <span>
                                                    <b className="aa-cell-mono room-code-lg">{r.roomName}</b>
                                                </span>
                                                <span className="aa-btn-group">
                                                    <span className="aa-badge">배정 {r.assignedCount}</span>
                                                    <span className="aa-badge">가용 {r.available}</span>
                                                    <span className="aa-badge aa-badge--muted">허용 {r.maxParallel}</span>
                                                </span>
                                            </button>
                                        </li>
                                    ))}
                                    {!roomsForAssign.length && (
                                        <div className="aa-subtle" style={{ textAlign: "center", padding: ".8rem 0" }}>
                                            사용 가능한 강의실이 없습니다.
                                        </div>
                                    )}
                                </ul>
                            </section>

                            {/* 우: 시간표 목록 */}
                            <section className="aa-panel tight">
                                <div className="aa-row" style={{ justifyContent: "space-between", marginBottom: ".4rem" }}>
                                    <h4 className="aa-title--sm">시간표</h4>
                                    <div className="aa-subtle">
                                        {selectedRoom ? (
                                            <>
                                                선택한 강의실: <b className="aa-cell-mono">{selectedRoom.roomCode}</b> (가용 {selectedRoom.available})
                                            </>
                                        ) : (
                                            <>강의실을 먼저 선택하세요.</>
                                        )}
                                    </div>
                                </div>

                                <div className="aa-table-wrap">
                                    <table className="aa-table timetable">
                                        <colgroup>
                                            <col style={{ width: 38 }} />
                                            <col style={{ width: 120 }} />
                                            <col style={{ width: 120 }} />
                                            <col style={{ width: 160 }} />
                                            <col style={{ width: 140 }} />
                                        </colgroup>
                                        <thead>
                                        <tr>
                                            <th></th>
                                            <th>반</th>
                                            <th>과목</th>
                                            <th>시간</th>
                                            <th>배정방</th>
                                        </tr>
                                        </thead>
                                        <tbody>
                                        {timeslots.map((t) => (
                                            <tr key={t.timeslotId}>
                                                <td>
                                                    <input
                                                        type="checkbox"
                                                        checked={selTsIds.has(t.timeslotId)}
                                                        onChange={() => toggleTimeslot(t.timeslotId)}
                                                        aria-label={`select-${t.timeslotId}`}
                                                        disabled={reorderMode}
                                                    />
                                                </td>
                                                <td className="aa-ellipsis">{t.className ?? t.classCode ?? "-"}</td>
                                                <td>{t.subjectName ?? "-"}</td>
                                                <td className="time">
                                                    {t.startTime}~{t.endTime}
                                                </td>
                                                <td className="assigned">
                                                    <span className={`room-text ${t.room ? "" : "aa-subtle"}`}>{t.room || "미배정"}</span>
                                                </td>
                                            </tr>
                                        ))}
                                        {!timeslots.length && (
                                            <tr>
                                                <td colSpan={5} className="aa-subtle" style={{ textAlign: "center", padding: "1rem 0" }}>
                                                    해당 시간의 시간표가 없습니다.
                                                </td>
                                            </tr>
                                        )}
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                        </div>
                    </section>
                </div>
            </div>

            {/* 등록/수정 모달 */}
            {modalOpen && (
                // ✅ Modal.jsx(v2) 대응: 폭은 size="lg"(=max-w-2xl) 사용
                <Modal
                    title={isCreate ? "새 강의실 등록" : "강의실 수정"}
                    onClose={() => setModalOpen(false)}
                    size="lg"
                >
                    <div className="aa-form-grid-2">
                        {/* 코드(신규만) */}
                        <div className="aa-field">
                            <label className="aa-label">코드</label>
                            <input
                                className="aa-input"
                                value={form.code}
                                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                                placeholder="예: 1F-A"
                                disabled={!isCreate}
                                title={!isCreate ? "코드는 수정할 수 없습니다." : ""}
                            />
                        </div>

                        {/* 이름 */}
                        <div className="aa-field">
                            <label className="aa-label">이름</label>
                            <input
                                className="aa-input"
                                value={form.name}
                                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                placeholder="표시명"
                            />
                        </div>

                        {/* 정원 */}
                        <div className="aa-field">
                            <label className="aa-label">정원</label>
                            <input
                                className="aa-input text-right"
                                value={form.capacity}
                                onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
                                placeholder="예: 20"
                            />
                        </div>

                        {/* 동시 허용 수 */}
                        <div className="aa-field">
                            <label className="aa-label">동시 허용 수</label>
                            <input
                                className="aa-input text-right"
                                type="number"
                                min={1}
                                value={form.maxParallel}
                                onChange={(e) => setForm((f) => ({ ...f, maxParallel: e.target.value }))}
                                placeholder="예: 1~3"
                            />
                        </div>

                        {/* 사용여부(use_yn) */}
                        <div className="aa-field">
                            <label className="aa-label">사용여부</label>
                            <select className="aa-select" value={form.useYn} onChange={(e) => setForm((f) => ({ ...f, useYn: e.target.value }))}>
                                <option value="1">사용</option>
                                <option value="0">미사용</option>
                            </select>
                        </div>

                        {/* 메모 */}
                        <div className="aa-field" style={{ gridColumn: "1 / -1" }}>
                            <label className="aa-label">메모</label>
                            <input
                                className="aa-input"
                                value={form.memo}
                                onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
                                placeholder="비고"
                            />
                        </div>
                    </div>

                    <div className="aa-row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
                        <button className="aa-btn aa-btn-primary" onClick={saveRoom} style={{ marginLeft: 8 }}>
                            저장
                        </button>
                    </div>
                </Modal>
            )}

            {/* 강의실 조회 모달 */}
            {browseOpen && (
                // ✅ Modal.jsx(v2) 대응: 폭은 size="2xl"로 넓게
                //    ※ 과거 커스텀 스타일 의존이 있을 수 있어 className="modal-wide"는 추가 클래스 형태로 유지
                <Modal
                    title="강의실 조회"
                    onClose={() => setBrowseOpen(false)}
                    size="2xl"
                    className="modal-wide"
                >
                    {/* 기본값: 현재 선택된 관/요일로 오픈 (이 페이지는 기억 안 함 정책) */}
                    <RoomGridModal initialWork={work} initialDay={dow} />
                </Modal>
            )}
        </div>
    );
}