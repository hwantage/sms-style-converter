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

			if (declarations === targetStyle) {
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
			styles: normalQuoteMatch[2],
			isEscaped: false
		};
	}

	// 이스케이프된 따옴표 패턴
	const escapedQuoteMatch = text.match(/style\s*=\s*(\\["'])((?:(?!\1).)*)\1/);
	if (escapedQuoteMatch) {
		return {
			quote: escapedQuoteMatch[1],
			styles: escapedQuoteMatch[2],
			isEscaped: true
		};
	}

	return null;
}

function activate(context) {
	let disposable = vscode.commands.registerCommand('sms-style-converter.convertStyle', async function () {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			return;
		}

		const selection = editor.selection;
		const text = editor.document.getText(selection);
		
		// style 속성 또는 CSS 선언 파싱
		const styleInfo = parseStyleAttribute(text.trim());
		let styleValue = "";

		if (!styleInfo) {
			if (isValidCssDeclaration(text.trim())) {
				styleValue = {
					styles: text,
					quote: '',  // 기본 따옴표 설정
					isEscaped: false
				};
			} else {
				vscode.window.showErrorMessage('선택된 텍스트가 유효한 CSS 속성이 아닙니다.');
				return;
			}
		}

		const { quote, styles, isEscaped } = styleValue ? styleValue : styleInfo;
		const hasDisplayNone = /display\s*:\s*none\s*;?\s*/.test(styles);
		
		// display:none 제거
		let processedStyles = styles.replace(/display\s*:\s*none\s*;?\s*/g, '').replace(/;\s*$/, '');
		const minifiedStyles = minifyCss(processedStyles);

		// 스타일이 비어있으면 처리하지 않음
		if (!minifiedStyles) {
			const className = hasDisplayNone ? 'hide' : '';
			if (styleValue !== ""){
				await editor.edit(editBuilder => {
					editBuilder.replace(selection, className);
				});
			} else {
				await editor.edit(editBuilder => {
					if (className) {
						const classAttr = isEscaped ? 
							`class=${quote}${className}${quote}` :
							`class=${quote}${className}${quote}`;
						editBuilder.replace(selection, classAttr);
					} else {
						editBuilder.replace(selection, '');
					}
				});
			}
			return;
		}
		
		const cssFiles = [
			'/DLPCenter.View.Web/src/main/webapp/dist/css/main_deco_1.css',
			'/DLPCenter.View.Web/src/main/webapp/dist/css/vendors_deco_1.css',
			'/DLPCenter.View.Web/src/main/webapp/css2/cspfix.css'
		];

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
				fs.appendFileSync(vscode.workspace.rootPath + cssFiles[2], '\n' + newCssRule);
			} catch (error) {
				vscode.window.showErrorMessage('CSS 파일에 새로운 스타일을 추가하는데 실패했습니다.');
				return;
			}
		}

		// 최종 클래스 이름 생성
		const finalClassName = hasDisplayNone ? `hide ${matchedClassName}` : matchedClassName;

		// 텍스트 교체 - 원본 따옴표 스타일 유지
		if (styleValue === ""){
			await editor.edit(editBuilder => {
				const classAttr = isEscaped ? 
					`class=${quote}${finalClassName}${quote}` :
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
