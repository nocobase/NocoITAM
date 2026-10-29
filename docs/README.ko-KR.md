<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="images/nocoitam-logo-dark.svg">
    <img src="images/nocoitam-logo.svg" width="240" alt="NocoITAM">
  </picture>
</h1>

<p align="center"><strong>에이전트가 챙기고, IT 자산은 제자리에.</strong></p>

<p align="center">오픈소스 IT 자산 관리 · NocoBase 기반</p>

<p align="center">
  <a href="../LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="Apache-2.0"></a>
  <a href="https://github.com/nocobase/NocoITAM/tags"><img src="https://img.shields.io/github/v/tag/nocobase/NocoITAM?label=version&sort=semver&include_prereleases" alt="version"></a>
  <a href="https://www.nocobase.com"><img src="https://img.shields.io/badge/built%20on-NocoBase-1f6feb" alt="Built on NocoBase"></a>
</p>

<p align="center">
  <a href="https://solutions.nocobase.com/itam/"><strong>온라인 체험</strong></a> · <a href="https://www.nocobase.com/ko-KR/solution-itam/">웹사이트</a>
</p>

<p align="center">
  <a href="../README.MD">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.ja-JP.md">日本語</a> · <strong>한국어</strong> · <a href="README.de-DE.md">Deutsch</a> · <a href="README.fr-FR.md">Français</a> · <a href="README.es-ES.md">Español</a> · <a href="README.pt-BR.md">Português</a> · <a href="README.ru-RU.md">Русский</a> · <a href="README.id-ID.md">Bahasa Indonesia</a> · <a href="README.vi-VN.md">Tiếng Việt</a>
</p>

NocoITAM은 [NocoBase](https://www.nocobase.com) 기반의 오픈소스 IT 자산 관리 시스템입니다. 기존 ITAM 도구는 사람이 손으로 관리하는 대장입니다. NocoITAM에서는 에이전트가 MDM 불일치를 정리하고, 신규 입사자의 장비를 갖추고, 구매 전마다 재고와 유휴 자산을 확인합니다. 모든 기기, 시트, 비용이 기록으로 남습니다.

https://github.com/user-attachments/assets/7bccd7f4-c4c7-4a2f-8579-d6b7fb1b0a44

## 기능

- **구매 전에 재고부터 확인.** 구매 주문이 승인에 올라가면 승인 도우미가 재고나 유휴 기기로 충당할 수 있는지 확인하고, 과거 단가와 비슷한 요청을 비교해 승인자를 위한 판단과 의견을 초안으로 작성합니다.
- **입사 첫날부터 준비 완료.** 부서와 직위마다 입사 키트가 있습니다. 신규 입사자의 준비 계획은 재고, 유휴 시트, 입고 예정 주문, 퇴사자 반납품에서 고르고, AI가 이유와 함께 기기를 고르며, 부족한 것은 클릭 한 번으로 구매 주문을 만듭니다.
- **퇴사 시 전부 회수.** 퇴사자의 기기, 액세서리, 시트는 모두 돌아올 때까지 추적하고, 담당하던 기록은 인계하며, 마지막 근무일에 로그인을 비활성화합니다.
- **MDM 불일치가 처리 계획으로.** Microsoft Intune과 Jamf Pro를 매일 밤 동기화하고 일련번호로 대장과 대조합니다. 에이전트가 불일치를 분류해 사용자가 다른 기기는 기기 담당자에게, 등록되지 않은 기기는 자산 관리자에게, 판단이 어려운 경우는 사람에게 넘깁니다.
- **스마트 등록.** 견적서, 송장, 납품서를 붙여 넣거나 끌어다 놓으면 AI가 품목을 모델에 맞춰 구매 주문을 채우고, 입고를 주문과 대조하며(수량, 일련번호, 보증), 수리 보고서와 폐기 증명서도 읽습니다. 새 모델의 사양은 웹에서 채웁니다.
- **3개의 에이전트, 일하는 자리의 AI.** 모든 페이지에서 대화할 수 있는 자산 관리 에이전트는 볼 수 있는 기록을 바탕으로 답하고, 카드에서 확인할 계획을 제안합니다. 승인 도우미와 MDM 불일치 후속 조치는 백그라운드에서 일하며, 입고부터 수리 견적과 교체 비교까지 11곳에서 AI가 돕습니다. 에이전트는 제안하고, 결정은 사람이 합니다.
- **라이선스와 구독 관리.** 사용자별, 기기별, 사이트, 무료 라이선스를 지원하고 시트, 키, 갱신일을 기록합니다. 시트가 바뀔 때마다 준수 상태를 계산하고, 초과 할당이나 유휴 시트는 갱신 전에 알려 줍니다.
- **놓치는 일 없이.** 할 일 화면은 14가지 위험 점검(보증과 구독 종료, 유휴 시트, 최소 재고 미만, 1년간 실사되지 않은 기기)으로 시작하고, 이어서 팀의 일을 열로 보여 줍니다: 승인, 입퇴사, 구매, 수리, 폐기, 재고 실사.
- **IT가 가진 모든 것을 하나의 대장에.** 기기, 액세서리, 소모품, 부품, 소프트웨어 라이선스를 구매, 입고, 배정, 대여, 수리, 실사, 폐기까지 각각의 이력과 함께 관리합니다. 10가지 보고서, CSV 가져오기와 내보내기, 모든 기록을 아우르는 검색(⌘K / Ctrl+K).
- **맞춤 설정.** 표준 키트, 예산, 승인 규칙을 업무 가이드에 평이한 문장으로 적으면 모든 에이전트가 그대로 따릅니다. 각 에이전트의 작업 방식은 수정할 수 있는 스킬입니다. 소스가 공개되어 있어 나머지는 코딩 에이전트가 바꿀 수 있습니다.
- **셀프 호스팅.** 데이터는 자체 서버에 두고, 모델은 DeepSeek, OpenAI, Claude, Gemini, Qwen 등에서 고릅니다. 화면은 12개 언어를 지원합니다. Apache-2.0.

## 빠른 시작

먼저 둘러보고 싶다면 [온라인 체험](https://solutions.nocobase.com/itam/): 데모 계정으로 로그인된 상태로 열리며, 모든 데이터는 가상입니다.

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

운영 환경 배포는 [배포](guide.md#deployment)를, PostgreSQL이나 MySQL에서 실행하려면 [설정](guide.md#configuration)을 참고하세요.

## 라이선스

NocoITAM은 NocoBase로 만들어졌으며 [Apache-2.0](../LICENSE) 라이선스로 배포됩니다.
