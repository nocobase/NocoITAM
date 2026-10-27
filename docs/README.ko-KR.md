# NocoITAM

[English](../README.MD) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja-JP.md) | 한국어 | [Deutsch](README.de-DE.md) | [Français](README.fr-FR.md) | [Español](README.es-ES.md) | [Português](README.pt-BR.md) | [Русский](README.ru-RU.md) | [Bahasa Indonesia](README.id-ID.md) | [Tiếng Việt](README.vi-VN.md)

NocoITAM은 [NocoBase 3](https://www.nocobase.com) 기반의 오픈소스 IT 자산 관리 시스템입니다. 기존 ITAM 도구는 사람이 손으로 관리하는 대장입니다. NocoITAM에서는 에이전트가 MDM 불일치를 정리하고, 신규 입사자의 장비를 갖추고, 구매 전마다 재고와 유휴 자산을 확인합니다. 모든 기기, 시트, 비용이 기록으로 남습니다.

https://github.com/user-attachments/assets/7bccd7f4-c4c7-4a2f-8579-d6b7fb1b0a44

[온라인 체험](https://solutions.nocobase.com/itam/) · [웹사이트](https://www.nocobase.com/ko-KR/solution-itam/)

## 주요 기능

- **구매 전에 재고부터 확인.** 구매 주문이 승인에 올라가면 승인 도우미가 재고나 유휴 기기로 충당할 수 있는지 확인하고, 과거 단가와 비슷한 요청을 비교해 승인자를 위한 판단과 의견을 초안으로 작성합니다.
- **입사 첫날부터 준비 완료, 퇴사 시 전부 회수.** 신규 입사자의 입사 키트를 재고와 유휴 시트에 맞춰 한 번에 갖추고, 부족한 것은 클릭 한 번으로 구매 주문을 만듭니다. 퇴사자의 기기, 액세서리, 시트는 모두 돌아올 때까지 추적하고, 담당하던 기록은 인계합니다.
- **MDM 불일치가 처리 계획으로.** Intune이나 Jamf Pro와 동기화할 때마다 에이전트가 불일치를 분류합니다. 사용자가 다른 기기는 기기 담당자에게, 등록되지 않은 기기는 자산 관리자에게, 판단이 어려운 경우는 사람에게 넘깁니다.
- **IT가 가진 모든 것을 하나의 대장에.** 기기, 액세서리, 소모품, 부품, 소프트웨어 라이선스를 구매, 입고, 배정, 대여, 수리, 실사, 폐기까지 각각의 이력과 함께 관리합니다.
- **모든 페이지에 어시스턴트.** 자산 관리 에이전트는 사용자가 볼 수 있는 기록을 바탕으로 답하고, 사용자가 확인할 계획을 제안합니다. 견적서, 송장, 납품서 같은 문서는 AI가 읽고 양식을 채워 주며, 사용자가 확인한 뒤 저장합니다. 에이전트는 제안하고, 결정은 사람이 합니다.
- **규칙도 코드도 당신의 것.** 표준 키트, 예산, 승인 규칙을 업무 가이드에 적으면 모든 에이전트가 그대로 따릅니다. 코딩 에이전트에게 ITAM 소스를 직접 고치게 할 수도 있습니다. 오픈소스, 셀프 호스팅, 온전히 당신의 것입니다.

## 빠른 시작

### 1. 설치

**코딩 에이전트로 설치.** 가장 쉬운 방법입니다. NocoITAM을 둘 폴더에서 Claude Code, Codex 또는 Cursor를 열고 이렇게 말하세요.

```text
https://github.com/nocobase/NocoITAM 에서 NocoITAM을 설치하고 실행해 줘. 저장소의 AGENTS.md와 README를 따라 줘.
```

**직접 설치.** Node.js 24 이상과 pnpm 10(`corepack enable`)이 필요합니다. 데이터는 기본적으로 SQLite 파일에 저장되며, PostgreSQL과 MySQL도 사용할 수 있습니다.

```bash
git clone https://github.com/nocobase/NocoITAM.git
cd NocoITAM
pnpm install
pnpm nocobase config init --dialect sqlite
pnpm dev
```

### 2. 로그인

`pnpm dev`가 출력하는 `Local:` 주소(보통 `http://127.0.0.1:13000/main/`)를 열고 `nocobase`와 비밀번호 `admin123`으로 로그인합니다.

### 3. 데모 데이터 가져오기

상단 배너에서 가져오거나 **설정 → 데모 데이터**를 엽니다. 약 40명 규모의 회사와 그 기기, 재고, 라이선스, 구매 주문, 수리, 실사, 폐기, 그리고 데모용 Intune과 Jamf 플랫폼이 들어갑니다. 실제로 사용하기 전에 같은 페이지에서 제거합니다.

### 4. AI 모델 설정

**에이전트 팀 → 모델**에서 DeepSeek, OpenAI, Claude, Gemini, Qwen 같은 모델 서비스를 키와 함께 추가합니다. 자산 관리 에이전트와 각 에이전트에 필요하며, 나머지 기능은 없어도 동작합니다.

[가이드](guide.md)(영어)에서 이후 단계, 데모 계정, 역할, 에이전트, 설정(AI, MDM, 데이터베이스), 배포와 개발을 설명합니다.

## 라이선스

[Apache License 2.0](../LICENSE)
