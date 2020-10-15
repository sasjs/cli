$'\e[34mRequesting secret from Github API'
curl \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/orgs/sasjs/actions/secrets/ACCESS_TOKEN