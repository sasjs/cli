import { execFileSync } from 'child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'
import { generateSnippets } from '../snippets'
import { setConstants } from '../../../utils'

describe('snippet signatures', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'sasjs-snippets-'))
    await mkdir(path.join(root, 'macros'))
    await setConstants(false)
    process.projectDir = root
  })
  afterEach(async () => rm(root, { recursive: true, force: true }))

  async function body(name: string, source: string): Promise<string> {
    await writeFile(path.join(root, 'macros', `${name}.sas`), source)
    await generateSnippets([path.join(root, 'macros')], 'output.json')
    const snippets = JSON.parse(
      await readFile(path.join(root, 'output.json'), 'utf8')
    )
    return snippets[name].body
  }

  it.each(['datalines', 'cards', 'datalines4', 'cards4'])(
    'ignores %s data even when it contains SAS syntax and unmatched quotes',
    async (statement) => {
      const end = statement.endsWith('4') ? ';;;;' : ';'
      expect(
        await body(
          'records',
          `data work.records; input text $char80.;\n${statement};\n%macro records(fake); ' unmatched\n${end}\nrun;\n%macro records(real); %mend;`
        )
      ).toBe('%records(${1:real})')
    }
  )

  it.each(['lines', 'lines4', 'LINES', 'LINES4'])(
    'ignores %s inline data containing a fake declaration',
    async (statement) => {
      const end = statement.toLowerCase().endsWith('4') ? ';;;;' : ';'
      expect(
        await body(
          'records',
          `data work.records; input text $char80.;\n${statement};\n%macro records(fake);\n${end}\nrun;\n%macro records(real); %mend;`
        )
      ).toBe('%records(${1:real})')
    }
  )

  it.each(['datalines', 'cards', 'lines'])(
    'finds the next macro after an indented %s terminator',
    async (statement) => {
      expect(
        await body(
          'records',
          `data work.records; input text $char80.;\r\n${statement};\r\nplain data\r\n  ;\r\nrun;\r\n%macro records(real); %mend;`
        )
      ).toBe('%records(${1:real})')
    }
  )

  it.each(['datalines4', 'cards4', 'lines4'])(
    'keeps indented four semicolons as %s data until the column-one terminator',
    async (statement) => {
      expect(
        await body(
          'records',
          `data work.records; input text $char80.;\n${statement};\n  ;;;;\n%macro records(fake);\n;;;;\nrun;\n%macro records(real); %mend;`
        )
      ).toBe('%records(${1:real})')
    }
  )

  it.each([
    ['datalines', ';', '\n'],
    ['cards', '  ;', '\r\n'],
    ['lines', ';', '\r\n'],
    ['datalines4', ';;;;', '\n'],
    ['cards4', ';;;;', '\r\n'],
    ['lines4', ';;;;', '\n']
  ])(
    'finds a macro on the same line as the %s terminator',
    async (statement, end, newline) => {
      expect(
        await body(
          'records',
          [
            `data work.records; input text $char80.; ${statement};`,
            '%macro records(fake);',
            `${end} %macro records(real); %mend;`
          ].join(newline)
        )
      ).toBe('%records(${1:real})')
    }
  )

  it('recognizes a data statement after a SAS block comment', async () => {
    expect(
      await body(
        'records',
        'data work.records; input text $char80.; /* inline input */ datalines;\n%macro records(fake);\n;\nrun;\n%macro records(real); %mend;'
      )
    ).toBe('%records(${1:real})')
  })

  it.each([
    '%macro ambiguous(first); %mend; %macro ambiguous(second); %mend;',
    '%macro ambiguous(first); %macro ambiguous(second); %mend; %mend;',
    '%macro wrapper(); %macro ambiguous(second); %mend; %mend;'
  ])(
    'falls back for repeated or nested matching declarations',
    async (source) => {
      expect(await body('ambiguous', source)).toBe('%ambiguous($1)')
    }
  )

  it('uses a final tab stop for keyword-only and empty declarations', async () => {
    expect(
      await body('keywords', '%macro keywords(foo=1, bar=%str(a,b));')
    ).toBe('%keywords($0)')
    expect(await body('empty', '%macro empty();')).toBe('%empty($0)')
    expect(await body('bare', '%macro bare;')).toBe('%bare($0)')
  })

  it('falls back for files with a different macro name', async () => {
    expect(await body('report.v2', '%macro reportXv2(arg);')).toBe(
      '%report.v2($1)'
    )
  })

  it.each([
    '<h4> Example </h4>\n%brief(example)',
    '<pre>\n%brief(example)\n</pre>',
    'Example:\n%brief(example)'
  ])('stops brief before headings and examples', async (section) => {
    await writeFile(
      path.join(root, 'macros', 'brief.sas'),
      `/**\n  @brief Explanation\n  continued\n  ${section}\n*/\n%macro brief(); %mend;`
    )
    await generateSnippets([path.join(root, 'macros')], 'output.json')
    const snippets = JSON.parse(
      await readFile(path.join(root, 'output.json'), 'utf8')
    )
    expect(snippets.brief.description).toEqual(['Explanation continued'])
  })

  it.each([
    '/** @param [in] value Details */\n%macro param(value); %mend;',
    '/**\n * @param value Details **/ %macro param(value); %mend;'
  ])(
    'removes inline comment terminators from parameter descriptions',
    async (source) => {
      await writeFile(path.join(root, 'macros', 'param.sas'), source)
      await generateSnippets([path.join(root, 'macros')], 'output.json')
      const snippets = JSON.parse(
        await readFile(path.join(root, 'output.json'), 'utf8')
      )
      expect(snippets.param.description).toEqual([
        '\r',
        'Params:',
        '-value Details'
      ])
    }
  )

  it('stops the brief at the Doxygen block terminator', async () => {
    await writeFile(
      path.join(root, 'macros', 'brief.sas'),
      '/**\n  @brief Explanation\n**/\n%macro brief();'
    )
    await generateSnippets([path.join(root, 'macros')], 'output.json')
    const snippets = JSON.parse(
      await readFile(path.join(root, 'output.json'), 'utf8')
    )
    expect(snippets.brief.description).toEqual(['Explanation'])
  })

  it.each([
    '/**\n  @brief Explanation */\n%macro brief();',
    '/** \\brief Explanation */ %macro brief();\n%put leaked;',
    '/**\n  @brief Explanation\n  continued */ %macro brief();\n%put leaked;'
  ])('stops brief text at an inline block terminator', async (source) => {
    await writeFile(path.join(root, 'macros', 'brief.sas'), source)
    await generateSnippets([path.join(root, 'macros')], 'output.json')
    const snippets = JSON.parse(
      await readFile(path.join(root, 'output.json'), 'utf8')
    )
    expect(snippets.brief.description).toEqual([
      source.includes('continued') ? 'Explanation continued' : 'Explanation'
    ])
  })

  it('generates signature snippets and fallback through the public CLI', async () => {
    await mkdir(path.join(root, 'sasjs'))
    await mkdir(path.join(root, 'macros', 'nested'))
    await writeFile(
      path.join(root, 'sasjs', 'sasjsconfig.json'),
      JSON.stringify({
        macroFolders: ['macros'],
        defaultTarget: 'local',
        targets: [
          {
            name: 'local',
            serverType: 'SASJS',
            serverUrl: 'http://localhost:5000',
            appLoc: '/test'
          }
        ]
      })
    )
    await writeFile(
      path.join(root, 'macros', 'nested', 'actual.sas'),
      '%macro actual(one, option=default); %mend;'
    )
    await writeFile(path.join(root, 'macros', 'plain.sas'), 'data work.x; run;')
    execFileSync(
      process.execPath,
      [
        '-r',
        require.resolve('ts-node/register/transpile-only'),
        path.resolve(__dirname, '../../../../src/index.ts'),
        'snippets',
        '-o',
        'output.json'
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          TS_NODE_PROJECT: path.resolve(__dirname, '../../../../tsconfig.json')
        }
      }
    )
    const snippets = JSON.parse(
      await readFile(path.join(root, 'output.json'), 'utf8')
    )
    expect(snippets.actual).toEqual({
      prefix: '%actual',
      body: '%actual(${1:one})',
      description: []
    })
    expect(snippets.plain).toEqual({
      prefix: '%plain',
      body: '%plain($1)',
      description: []
    })
  })

  it('does not parse declarations inside unterminated comments', async () => {
    expect(await body('unfinished', '/* %macro unfinished(fake);')).toBe(
      '%unfinished($1)'
    )
  })

  it('falls back for positional parameters after keyword parameters', async () => {
    expect(
      await body('badorder', '%macro badorder(opt=default, required);')
    ).toBe('%badorder($1)')
  })

  it('falls back when a keyword name is repeated', async () => {
    expect(await body('duplicate', '%macro duplicate(arg, ARG=);')).toBe(
      '%duplicate($1)'
    )
  })

  it('preserves an entirely quoted keyword default as an optional parameter', async () => {
    expect(
      await body('quoteddefault', '%macro quoteddefault(option="value");')
    ).toBe('%quoteddefault($0)')
  })

  it.each(['a,', ',a', 'a,,b', ','])(
    'falls back for an empty parameter segment: %s',
    async (params) => {
      expect(
        await body('emptysegment', `%macro emptysegment(${params});`)
      ).toBe('%emptysegment($1)')
    }
  )

  it('falls back if parameter syntax is malformed rather than guessing', async () => {
    expect(await body('bad', '%macro bad(a, weird-key=value);')).toBe(
      '%bad($1)'
    )
  })

  it('ignores macro comment text past a masked semicolon', async () => {
    expect(
      await body('test', '%* text %; %macro test(wrong); %macro test(right);')
    ).toBe('%test(${1:right})')
  })

  it('handles quoted semicolons in macro comments', async () => {
    expect(
      await body(
        'quotedcomment',
        '%* "a;%macro quotedcomment(wrong);b"; %macro quotedcomment(real);'
      )
    ).toBe('%quotedcomment(${1:real})')
  })

  it('finds a declaration when comments separate its tokens', async () => {
    expect(
      await body(
        'commented',
        '%macro/* gap */ commented( first /*note*/, %* hi; second, opt=1 );'
      )
    ).toBe('%commented(${1:first}, ${2:second})')
  })

  it('reads starred backslash Doxygen brief and parameter tags', async () => {
    await writeFile(
      path.join(root, 'macros', 'doxy.sas'),
      '/**\n * \\brief Summary\n * continued\n * \\param[in] value Details\n */\n%macro doxy(value);'
    )
    await generateSnippets([path.join(root, 'macros')], 'output.json')
    const snippets = JSON.parse(
      await readFile(path.join(root, 'output.json'), 'utf8')
    )
    expect(snippets.doxy.description).toEqual([
      'Summary continued',
      '\r',
      'Params:',
      '-value Details'
    ])
  })

  it('includes multiline brief text and preserves parameter descriptions', async () => {
    await writeFile(
      path.join(root, 'macros', 'docs.sas'),
      `/**
  @brief First line
    second line
  @param value description
  @details ignored
*/
%macro docs(value); %mend;`
    )
    await generateSnippets([path.join(root, 'macros')], 'output.json')
    const snippets = JSON.parse(
      await readFile(path.join(root, 'output.json'), 'utf8')
    )
    expect(snippets.docs.description).toEqual([
      'First line second line',
      '\r',
      'Params:',
      '-value description'
    ])
  })

  it('preserves masked quote characters in macro quoting', async () => {
    expect(
      await body('mask', "%macro mask(x, y=%str(%'), z=); %put 'later'; %mend;")
    ).toBe('%mask(${1:x})')
  })

  it('falls back for an unparseable matching declaration', async () => {
    expect(
      await body('broken', '%macro broken(a, %unknown(foo)); %mend;')
    ).toBe('%broken($1)')
  })

  it('accepts declarations with macro options and without parentheses', async () => {
    expect(await body('alpha', '%macro alpha / minoperator; %mend;')).toBe(
      '%alpha($0)'
    )
    expect(
      await body('beta', '%macro beta(x, optional=) / des="test"; %mend;')
    ).toBe('%beta(${1:x})')
  })

  it('handles nested and masked punctuation in keyword defaults', async () => {
    expect(
      await body(
        'mix',
        `%macro mix(first, opt=%str(a,%(b%)), other="x,y)", second=);
%mend;`
      )
    ).toBe('%mix(${1:first})')
  })

  it('falls back when execution-time quoting contains a declaration', async () => {
    expect(
      await body(
        'dynamic',
        '%let x=%bquote(%macro dynamic(uncertain);); %macro dynamic(real);'
      )
    ).toBe('%dynamic($1)')
  })

  it('ignores declarations inside macro-quoted text', async () => {
    expect(
      await body(
        'fake',
        '%let x=%nrstr(%macro fake(wrong);); %macro fake(real);'
      )
    ).toBe('%fake(${1:real})')
  })

  it('ignores fake declarations in comments and strings', async () => {
    expect(
      await body(
        'demo',
        `/* %macro demo(wrong); */
%* %macro demo(also_wrong);
%let x="%macro demo(nope);";
%macro demo(real); %mend;`
      )
    ).toBe('%demo(${1:real})')
  })

  it('uses named positional parameters without inserting keyword defaults', async () => {
    expect(
      await body('Report', '%macro report(data, column, debug=0); %mend;')
    ).toBe('%Report(${1:data}, ${2:column})')
  })
})
