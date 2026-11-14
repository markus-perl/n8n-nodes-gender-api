# @gender-api/n8n-nodes-gender-api

The official [n8n](https://n8n.io/) community node for [Gender-API.com](https://gender-api.com).
It finds the likely gender and the country of origin of a name. The input can be a first name,
a full name or an email address. Use it to enrich a list of contacts, to pick a salutation, or as a
tool for the n8n AI Agent.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/)
workflow automation platform.

- [Installation](#installation)
- [Operations](#operations)
- [Credentials](#credentials)
- [Credits](#credits)
- [Usage](#usage)
- [Compatibility](#compatibility)
- [Resources](#resources)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/)
in the n8n community nodes documentation. The package name is
`@gender-api/n8n-nodes-gender-api`.

## Operations

| Resource | Operation | API endpoint | Credits |
|---|---|---|---|
| Gender | Get by First Name | `POST /v2/gender/by-first-name` | 1 per name found |
| Gender | Get by Full Name | `POST /v2/gender/by-full-name` | 1 per name found |
| Gender | Get by Email Address | `POST /v2/gender/by-email-address` | 1 per name found |
| Country of Origin | Get by First Name / Full Name / Email Address | `POST /v2/country-of-origin` | 2 per name found |
| Account | Get Statistics | `GET /v2/statistic` | 0 |

**Gender** operations take these optional *Additional Fields*:

- **Country**: two-letter ISO 3166-1 code, for example `US`. The same name can have a different
  gender in different countries.
- **IP Address**: Gender-API finds the country from the IP address when *Country* is not set.
- **Locale**: a browser locale, for example `en_US`. Gender-API uses it when neither *Country*
  nor *IP Address* is set.

*Options*:

- **Batch Size** (Gender only, default 100): the node sends up to this many input items to
  Gender-API in one request (`…-multiple` endpoints). Gender-API accepts at most 100 names per
  request. Each name still costs one credit, but a request needs enough credits for all names in it.
- **Put Result in Field**: write the Gender-API answer into this field of the input item and keep
  the other fields. When it is empty, the node outputs only the Gender-API answer.

Example answer of *Gender → Get by First Name*:

```json
{
  "input": { "first_name": "sandra", "country": "US" },
  "details": {
    "credits_used": 1,
    "duration": "72ms",
    "samples": 70,
    "country": "US",
    "first_name_sanitized": "sandra"
  },
  "result_found": true,
  "first_name": "Sandra",
  "probability": 0.61,
  "gender": "female"
}
```

## Credentials

1. Create a free account at [gender-api.com](https://gender-api.com). It includes 100 free
   credits per month.
2. Create an API token in your account under
   [API Tokens](https://gender-api.com/en/account/auth-tokens).
3. In n8n, create a **Gender-API.com API** credential and paste the token.

The node sends the token as `Authorization: Bearer <token>`. The credential test calls
`GET /v2/statistic`, which costs no credits.

## Credits

A lookup costs credits only when Gender-API finds the name. When the account has no credits left,
the node stops with *"Your Gender-API account has no credits left"* and a link to buy more. Turn on
**Settings → On Error → Continue** to get an item with `error`, `code` (for example
`limit-exceeded` or `invalid-auth-token`) and `httpCode` instead, so the workflow can branch on it.

## Usage

**Enrich a contact list.** Read rows (for example Google Sheets or a CSV file), add the Gender-API
node with *Gender → Get by First Name*, map the *First Name* field to the column with the first
names (`{{ $json.first_name }}`), set *Options → Put Result in Field* to `genderApi`, and write the
rows back. 1,000 rows need 10 API requests.

**Use it as an AI tool.** Connect the node to the *Tools* input of an *AI Agent* node. The agent can
then look up the gender or the country of origin of a name on its own.

## Compatibility

Built with `@n8n/node-cli` 0.56.4 against `n8n-workflow` 2.47. Loaded and run in n8n 2.47.7
(Node.js 24).

## Resources

- [Gender-API v2 documentation](https://gender-api.com/en/api-docs/v2)
- [OpenAPI specification](https://gender-api.com/openapi/openapi.yml)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)

## License

[MIT](LICENSE.md)
