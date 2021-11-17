module.exports = {
    extends: ['@commitlint/config-angular'],
    rules: {
        'type-enum': [2, 'always', ["feat", "fix", "docs", "style", "refactor", "perf", "test", "build", "ci", "chore", "revert"]],
        'subject-max-length': [2, 'always', 100]
    }
};
