# SMS Style Converter

인라인 스타일을 클래스 기반 스타일로 변환해주는 VS Code 익스텐션입니다.

## 주요 기능

- HTML의 인라인 스타일(`style` 속성)을 클래스 기반 스타일로 자동 변환
- 기존 CSS 파일에서 일치하는 스타일을 찾아 재사용
- 일치하는 스타일이 없을 경우 자동으로 새로운 클래스 생성
- `display: none` 스타일을 `hide` 클래스로 자동 변환
- JSP의 `<c:if>` 조건부 스타일 처리 지원

## 사용 방법

1. HTML 파일에서 변환하고자 하는 인라인 스타일을 선택합니다.
2. 다음 방법 중 하나로 변환을 실행합니다:
   - 단축키: `Ctrl+Shift+S`
   - 컨텍스트 메뉴: 우클릭 > "스타일 변환하기"

## 환경 설정

VS Code의 설정에서 다음 항목을 커스터마이즈할 수 있습니다:

1. 소스 CSS 파일 경로 (`smsStyleConverter.sourceCssFiles`)
   ```json
   {
     "smsStyleConverter.sourceCssFiles": [
       "/DLPCenter.View.Web/src/main/webapp/dist/css/main_deco_1.css",
       "/DLPCenter.View.Web/src/main/webapp/dist/css/vendors_deco_1.css"
     ]
   }
   ```

2. 생성될 CSS 파일 경로 (`smsStyleConverter.generatedCssFile`)
   ```json
   {
     "smsStyleConverter.generatedCssFile": "/DLPCenter.View.Web/src/main/webapp/css2/cspfix.css"
   }
   ```

## 지원하는 입력 형식

익스텐션은 다음과 같은 다양한 형식의 입력을 지원합니다:

1. 일반 style 속성
```html
style="margin-top: 8px; color: red;"
style='padding: 10px; background: #fff;'
style=\'border: 1px solid #000;\'
style=\"font-size: 14px;\"
```

2. CSS 선언문
```css
margin-top: 8px; color: red;
```

3. `<c:if>` 조건부 스타일
```html
<!-- 단일 조건부 스타일 -->
style="color: red; <c:if test="${condition}">display: none;</c:if>"

<!-- 다중 조건부 스타일 -->
style="border: 1px solid blue; <c:if test="${condition1}">display: none;</c:if><c:if test="${condition2}">display: inline-block;</c:if>"
```

## 스타일 변환 규칙

1. 기존 CSS 파일에서 일치하는 스타일 검색
   - 설정의 `sourceCssFiles`에 지정된 CSS 파일들에서 검색
   - 일치하는 스타일이 있으면 해당 클래스명 사용

2. 일치하는 스타일이 없는 경우
   - 설정의 `generatedCssFile`에 새로운 클래스 자동 생성
   - 클래스명 형식: `cspfix_[8자리 난수]`

3. `<c:if>` 태그 처리
   - `display: none` → `hide` 클래스로 변환
   - 그 외 스타일 → 일반 변환 규칙 적용
   - 조건문은 그대로 유지

예시:
```html
<!-- 입력 -->
style="border: 1px solid blue;<c:if test="${condition}">display:none</c:if>"

<!-- 출력 -->
class="cspfix_12345678 <c:if test="${condition}">hide</c:if>"
```

## CSS 처리 특징

- URL 내의 `<%=root %>` 패턴을 `..`로 자동 변환
- CSS 최소화(minification) 처리
- 단일 클래스 선택자만 처리 (`.xxx` 형태)
- 다음 유형의 선택자는 제외:
  - 복합 선택자 (공백, +, > 등 포함)
  - 가상 선택자 (`:` 포함)
  - 체인된 클래스 선택자 (`.aaa.bbb`)

## 주의사항

1. 변환 전 선택한 텍스트가 유효한 CSS 선언인지 확인됩니다.
2. 스타일 변환 시 원본 따옴표 스타일이 유지됩니다.
3. 새로운 클래스 생성 시 기존 클래스와의 중복을 확인합니다.
4. `<c:if>` 태그 내의 스타일도 유효한 CSS 선언이어야 합니다.

## 에러 처리

- 유효하지 않은 CSS 선언 선택 시 에러 메시지 표시
- CSS 파일 접근/수정 실패 시 에러 메시지 표시
- 변환 성공 시 생성된 클래스명 알림 표시


## 버그 문의

- hwan77@somansa.com
- UX기획팀 김정환