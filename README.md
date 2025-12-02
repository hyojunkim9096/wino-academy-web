# WINO Academy Admin Web

> **Enterprise Academy Management Dashboard**
>
> WINO Academy 백엔드 API를 관리하기 위한 React 기반의 SPA 어드민 대시보드입니다.
> 도메인 주도(Domain-Driven) 구조로 설계되어 유지보수와 확장이 용이합니다.

---

## 🛠 기술 스택 (Tech Stack)

* **Core**: React 18, Vite
* **Routing**: React Router v6 (Data Router)
* **State**: Context API (Auth, CommonCode)
* **Styling**: Tailwind CSS v4 (PostCSS)
* **HTTP**: Axios (Interceptor 기반 보안/오류 처리)
* **UI Kit**: Custom Components (Modal, Sheet, Alert), SweetAlert2

---

## 📁 프로젝트 구조 (Architecture)

기능(Feature) 단위로 응집도를 높인 **Domain-Driven Directory Structure**를 따릅니다.

```text
src/
├── features/              # 도메인별 기능 모듈 (핵심)
│   ├── course/            # 반/과목/시간표 관리
│   ├── student/           # 학생/원생 관리 (상담, 배정 포함)
│   ├── finance/           # 수납/청구 관리
│   ├── member/            # 직원/강사 관리
│   ├── school/            # 학교 정보 및 동기화
│   └── system/            # 시스템 설정 (로그, 코드, 권한)
├── common/                # 공통 모듈 (재사용 컴포넌트, 유틸)
│   ├── api/               # 공통 API (Auth 등)
│   ├── components/        # UI 컴포넌트 (Button, Modal...)
│   └── contexts/          # 전역 상태 (로그인세션, 공통코드)
└── app/                   # 앱 진입점 (App, Router)
