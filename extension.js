// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const CleanCSS = require('clean-css');
const css = require('css');

// CSS 규칙 캐시
let cssRulesCache = new Map();

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function minifyCss(css) {
	// root 패턴 변경
	css = css.replaceAll("<%=root%>", "..");
	css = css.replaceAll("<%=root %>", "..");

	// clean-css 옵션 설정
	const options = {
		level: {
			1: {
				specialComments: 0,
				removeEmpty: true,
				removeWhitespace: true
			},
			2: {
				mergeMedia: false,
				mergeNonAdjacentRules: false,
				removeDuplicateFontRules: false,
				removeDuplicateMediaBlocks: false,
				removeDuplicateRules: false,
				restructureRules: false
			}
		}
	};

	// CSS 문자열을 임시 클래스로 감싸서 처리
	const wrappedCss = `.temp{${css}}`;
	const minified = new CleanCSS(options).minify(wrappedCss);
	
	// 임시 클래스 제거하고 내용만 반환
	return minified.styles.replace(/^\.temp{/, '').replace(/}$/, '');
}

function findMatchingClass(cssContent, targetStyle) {
	try {
		// CSS 파싱
		const ast = css.parse(cssContent);
		
		// 규칙 검사
		for (const rule of ast.stylesheet.rules) {
			// 스타일 규칙만 처리
			if (rule.type !== 'rule') continue;

			// 단일 클래스 선택자만 처리
			const selector = rule.selectors[0];

			if (selector.includes("detail_content_label.m_t_00")) {
				console.log(selector);
			}

			if (rule.selectors.length !== 1 || // 단일 선택자만
				!selector.startsWith('.') ||   // 클래스 선택자만
				selector.includes(':') ||      // 가상 선택자 제외
				selector.includes(' ') ||      // 복합 선택자 제외
				selector.includes('+') ||      // 인접 형제 선택자 제외
				selector.includes('>') ||      // 자식 선택자 제외
				selector.includes('~') ||      // 일반 형제 선택자 제외
				(selector.match(/\./g) || []).length > 1) { // 체인된 클래스 선택자 제외
				continue;
			}

			// 선언부를 문자열로 변환
			const declarations = rule.declarations
				.filter(decl => decl.type === 'declaration')
				.map(decl => `${decl.property}:${decl.value}`)
				.join(';');

			if (declarations === targetStyle || declarations.replace(/\s*!important\s*$/, '') === targetStyle) {
				// 클래스 이름에서 . 제거
				return selector.substring(1);
			}
		}
	} catch (error) {
		console.error('CSS 파싱 에러:', error);
	}
	return null;
}

function generateRandomClassName(existingCssFiles) {
	while (true) {
		const randomNum = Math.floor(Math.random() * 100000000).toString().padStart(8, '0');
		const className = `cspfix_${randomNum}`;
		
		let isUnique = true;
		for (const file of existingCssFiles) {
			const content = fs.readFileSync(vscode.workspace.rootPath + file, 'utf8');
			if (content.includes(className)) {
				isUnique = false;
				break;
			}
		}
		
		if (isUnique) {
			return className;
		}
	}
}

function isValidCssDeclaration(cssText) {
	try {
		// CSS 선언을 파싱 가능한 형태로 만듦
		const dummyRule = `.dummy{${cssText}}`;
		const parsed = css.parse(dummyRule);
		
		// 규칙이 존재하고 선언이 있는지 확인
		if (!parsed.stylesheet || !parsed.stylesheet.rules[0] || !parsed.stylesheet.rules[0].declarations) {
			return false;
		}

		// 모든 선언이 유효한지 확인
		const declarations = parsed.stylesheet.rules[0].declarations;
		return declarations.length > 0 && declarations.every(decl => 
			decl.type === 'declaration' && decl.property && decl.value
		);
	} catch (error) {
		return false;
	}
}

function parseStyleAttribute(text) {
	// 일반 따옴표 패턴
	const normalQuoteMatch = text.match(/style\s*=\s*(["'])((?:(?!\1).)*)\1/);
	if (normalQuoteMatch) {
		return {
			quote: normalQuoteMatch[1],
			styles: normalQuoteMatch[2]
		};
	}

	// 이스케이프된 따옴표 패턴
	const escapedQuoteMatch = text.match(/style\s*=\s*(\\["'])((?:(?!\1).)*)\1/);
	if (escapedQuoteMatch) {
		return {
			quote: escapedQuoteMatch[1],
			styles: escapedQuoteMatch[2]
		};
	}

	return null;
}

function parseText(text) {
	const result = {
		cssText: text,
		cifBlocks: []
	};

	// c:if 태그 찾기
	const cifPattern = /<c:if test=["'](.*?)["']>(.*?)<\/c:if>/g;
	let match;
	let lastIndex = 0;
	let cssText = '';

	// 모든 c:if 태그와 그 사이의 CSS 추출
	while ((match = cifPattern.exec(text)) !== null) {
		// c:if 이전의 CSS 저장
		cssText += text.substring(lastIndex, match.index);
		
		// c:if 블록 정보 저장
		result.cifBlocks.push({
			condition: match[1],
			css: match[2].trim()
		});

		lastIndex = cifPattern.lastIndex;
	}

	// 마지막 c:if 이후의 CSS 추가
	cssText += text.substring(lastIndex);

	// 외부 CSS에서 불필요한 세미콜론 정리
	result.cssText = cssText.replace(/;;+/g, ';').replace(/^;|;$/g, '');

	return result;
}

function processCIfBlock(css, cssFiles) {
	// display 관련 특수 처리
	if (/display\s*:\s*none\s*/.test(css)) {
		return 'hide';
	}
	
	// 일반 CSS 처리
	if (isValidCssDeclaration(css)) {
		const minifiedCss = minifyCss(css);
		let className = null;
		
		// 기존 CSS 파일에서 매칭되는 클래스 찾기
		for (const cssFile of cssFiles) {
			try {
				const content = fs.readFileSync(vscode.workspace.rootPath + cssFile, 'utf8');
				className = findMatchingClass(content, minifiedCss);
				if (className) break;
			} catch (error) {
				console.error(`Error reading ${cssFile}:`, error);
			}
		}
		
		// 매칭되는 클래스가 없으면 새로 생성
		if (!className) {
			className = generateRandomClassName(cssFiles);
			const newCssRule = `.${className}{${minifiedCss}}`;
			try {
				fs.appendFileSync(vscode.workspace.rootPath + cssFiles[2], '\n' + newCssRule);
			} catch (error) {
				vscode.window.showErrorMessage('CSS 파일에 새로운 스타일을 추가하는데 실패했습니다.');
				return null;
			}
		}
		
		return className;
	}
	
	return null;
}

function activate(context) {
	let disposable = vscode.commands.registerCommand('sms-style-converter.convertStyle', async function () {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			return;
		}
		
		// 설정에서 CSS 파일 경로 가져오기
		const config = vscode.workspace.getConfiguration('smsStyleConverter');
		const sourceCssFiles = config.get('sourceCssFiles', [
			'/DLPCenter.View.Web/src/main/webapp/dist/css/main_deco_1.css',
			'/DLPCenter.View.Web/src/main/webapp/dist/css/vendors_deco_1.css'
		]);
		const generatedCssFile = config.get('generatedCssFile', 
			'/DLPCenter.View.Web/src/main/webapp/css2/cspfix.css'
		);

		const cssFiles = [...sourceCssFiles, generatedCssFile];
		const selection = editor.selection;
		const text = editor.document.getText(selection);
		const {cssText, cifBlocks} = parseText(text);
		const styleInfo = parseStyleAttribute(cssText.trim()); // style="..." 형태의 선언인지 확인 및 내용 파싱
		let styleValue = "";	// 스타일 속성 값 단독 처리

		if (!styleInfo) {	// style="..." 형태가 아닌 경우 단독 선택 여부 추가 확인
			if (isValidCssDeclaration(cssText.trim())) {	// 속성 값이 단독 선택이며 유효한 CSS 선언인 경우
				styleValue = {
					quote: '',  // 기본 따옴표 없음
					styles: cssText
				};
			} else {
				vscode.window.showErrorMessage('선택된 텍스트가 유효한 CSS 속성이 아닙니다.');
				return;
			}
		}

		const { quote, styles } = styleValue ? styleValue : styleInfo;
		const hasDisplayNone = /display\s*:\s*none\s*;?\s*/.test(styles);
		
		// display:none 제거
		let displayNoneRemovedStyles = styles.replace(/display\s*:\s*none\s*;?\s*/g, '').replace(/;\s*$/, '');
		const minifiedStyles = minifyCss(displayNoneRemovedStyles);

		// minifiedStyles 가 빈 값이거나 display:none 만 있는 경우 처리
		if (!minifiedStyles) {
			const className = hasDisplayNone ? 'hide' : '';
			if (styleValue !== ""){
				await editor.edit(editBuilder => {
					editBuilder.replace(selection, className);
				});
			} else {
				// c:if 블록 처리
				const cifResults = cifBlocks.map(block => {
					const cifBlockClassName = processCIfBlock(block.css, cssFiles);
					return cifBlockClassName ? `<c:if test="${block.condition}">${cifBlockClassName}</c:if>` : '';
				}).filter(result => result);

				await editor.edit(editBuilder => {
					if (className) {
						const classAttr = cifResults.length > 0 ? 
							`class=${quote}${className} ${cifResults.join(' ')}${quote}` :
							`class=${quote}${className}${quote}`;
						editBuilder.replace(selection, classAttr);
					} else {
						const classAttr = cifResults.length > 0 ? 
							`class=${quote}${cifResults.join(' ')}${quote}` :
							'';
						editBuilder.replace(selection, classAttr);
					}
				});
			}
			
			vscode.window.showInformationMessage(`스타일 값이 성공적으로 변환되었습니다`);

			return;
		}

		let matchedClassName = null;

		for (const cssFile of cssFiles) {
			try {
				const content = fs.readFileSync(vscode.workspace.rootPath + cssFile, 'utf8');
				matchedClassName = findMatchingClass(content, minifiedStyles);
				if (matchedClassName) {
					break;
				}
			} catch (error) {
				console.error(`Error reading ${cssFile}:`, error);
			}
		}

		if (!matchedClassName) {
			// 새로운 클래스 생성
			matchedClassName = generateRandomClassName(cssFiles);
			const newCssRule = `.${matchedClassName}{${minifiedStyles}}`;
			
			try {
				fs.appendFileSync(vscode.workspace.rootPath + generatedCssFile, '\n' + newCssRule);
			} catch (error) {
				vscode.window.showErrorMessage('CSS 파일에 새로운 스타일을 추가하는데 실패했습니다.');
				return;
			}
		}

		// 최종 클래스 이름 생성
		const finalClassName = hasDisplayNone ? `hide ${matchedClassName}` : matchedClassName;

		// 텍스트 교체 - 원본 따옴표 스타일 유지
		if (styleValue === ""){
			// c:if 블록 처리
			const cifResults = cifBlocks.map(block => {
				const cifBlockClassName = processCIfBlock(block.css, cssFiles);
				return cifBlockClassName ? `<c:if test="${block.condition}">${cifBlockClassName}</c:if>` : '';
			}).filter(result => result);

			await editor.edit(editBuilder => {
				const classAttr = cifResults.length > 0 ? 
					`class=${quote}${finalClassName} ${cifResults.join(' ')}${quote}` :
					`class=${quote}${finalClassName}${quote}`;
				editBuilder.replace(selection, classAttr);
			});
		} else {
			await editor.edit(editBuilder => {
				const classAttr = `${finalClassName}`;
				editBuilder.replace(selection, classAttr);
			});
		}

		vscode.window.showInformationMessage(`스타일이 성공적으로 변환되었습니다: ${finalClassName}`);
	});

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
