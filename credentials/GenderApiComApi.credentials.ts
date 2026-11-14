import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class GenderApiComApi implements ICredentialType {
	name = 'genderApiComApi';

	displayName = 'Gender-API.com API';

	icon: Icon = { light: 'file:../icons/gender-api.svg', dark: 'file:../icons/gender-api.dark.svg' };

	documentationUrl = 'https://gender-api.com/en/api-docs/v2';

	properties: INodeProperties[] = [
		{
			displayName: 'API Token',
			name: 'apiToken',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description:
				'Your Gender-API.com API token. Create one in your account under "API Tokens": https://gender-api.com/en/account/auth-tokens. A free account includes 100 credits per month.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiToken}}',
			},
		},
	};

	// GET /v2/statistic costs no credits and also answers when the account has no
	// credits left, so the test never spends anything and never fails for a valid token.
	// A missing or invalid token comes back as HTTP 400 (not 401) with a problem-details body.
	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://gender-api.com/v2',
			url: '/statistic',
			method: 'GET',
		},
		rules: [
			{
				type: 'responseCode',
				properties: {
					value: 400,
					message:
						'Gender-API rejected the API token. Check that you copied the whole token and that it is still active.',
				},
			},
		],
	};
}
