<?php

namespace App\Http\Controllers;

use App\Services\Shader\Providers;
use App\Services\ShaderGenerator;
use Illuminate\Http\Request;
use RuntimeException;
use Throwable;

// The shader assistant: a sentence in, an ISF shader out.
//
// Who pays decides almost everything about this endpoint, and there are two answers:
//
//   - the caller brought their own Anthropic key. Their usage is billed to them by Anthropic,
//     costs the operator nothing, and so costs no credits. This is the only mode a self-hosted
//     copy has, and it is why the project can be open source without the maintainer funding
//     everybody's generations.
//   - the caller used the server's key. That is real money out of the operator's account, so it
//     costs a credit.
//
// A user's key is never written down. It arrives on the request, is used for that one call, and
// is gone - not stored in the database, not logged, not cached on the service. The browser holds
// it and sends it each time. Storing other people's API keys is a liability worth a great deal
// more than the convenience of not re-pasting one.
//
// The generated shader is NOT saved here. It goes back to the browser, which compiles it on the
// real GPU and only then offers to publish it. That split is deliberate - this server has no
// WebGL context and cannot tell a working shader from one that fails to link, so saving here
// would fill the gallery with shaders nobody can render. The client is the only place that
// knows, so the client decides.
class ShaderGenerationController extends Controller
{
    private const COST = 1;

    public function generate(Request $request, ShaderGenerator $generator)
    {
        $data = $request->validate([
            'description' => ['required', 'string', 'min:3', 'max:2000'],
            // A repair round: the shader that failed and what the compiler said about it.
            'previous_source' => ['nullable', 'string', 'max:100000'],
            'compile_error' => ['nullable', 'string', 'max:8000'],
        ]);

        $user = $request->user();
        // Headers rather than body fields, so a key cannot end up in a request log that records
        // payloads, or in a URL, or in a bug report someone pastes with their sequence.
        $userKey = trim((string) $request->header('X-Shader-Key', ''));
        $ownKey = $userKey !== '';
        // A caller paying with their own key chooses their own provider and model - it is their
        // bill. Ignored entirely when they are spending the operator's credits.
        $userProvider = $ownKey ? ($request->header('X-Shader-Provider') ?: null) : null;
        $userModel = $ownKey ? ($request->header('X-Shader-Model') ?: null) : null;

        if ($ownKey && ! config('services.shader.allow_user_keys')) {
            return response()->json(['message' => 'This server does not accept user-supplied API keys.'], 403);
        }

        // Debited before the call, not after. The generation is the thing being paid for and it
        // costs real money the moment it is made, so a failure to bill has to stop the request
        // rather than be noticed afterwards. Refunded below if the call itself fails, which is
        // the case where the user got nothing.
        $meta = ['description' => mb_substr($data['description'], 0, 200)];
        if (! $ownKey && ! $user->moveCredits(-self::COST, 'shader_generation', $meta)) {
            return response()->json([
                'message' => 'You are out of credits. Add your own Anthropic API key in Settings to keep generating.',
                'credits' => $user->credits,
                'code' => 'insufficient_credits',
            ], 402);
        }

        try {
            $result = $generator->generate(
                $data['description'],
                $data['previous_source'] ?? null,
                $data['compile_error'] ?? null,
                $ownKey ? $userKey : null,
                $userProvider,
                $userModel,
            );
        } catch (RuntimeException $e) {
            // Not configured, or refused. The user gets their credit back and a straight answer.
            if (! $ownKey) {
                $user->moveCredits(self::COST, 'refund', [...$meta, 'error' => $e->getMessage()]);
            }

            return response()->json(['message' => $e->getMessage(), 'credits' => $user->credits], 503);
        } catch (Throwable $e) {
            if (! $ownKey) {
                $user->moveCredits(self::COST, 'refund', [...$meta, 'error' => class_basename($e)]);
            }
            report($e);

            return response()->json([
                'message' => 'The shader assistant could not be reached. Your credit was returned.',
                'credits' => $user->credits,
            ], 502);
        }

        return response()->json([
            'source' => $result['source'],
            'credits' => $user->credits,
            'charged' => ! $ownKey,
            'usage' => $result['usage'],
        ]);
    }

    /** The balance and the ledger behind it. */
    public function credits(Request $request)
    {
        $user = $request->user();

        return response()->json([
            'credits' => $user->credits,
            'cost_per_generation' => self::COST,
            // What this server can do, so the UI can tell a self-hosted copy (no server key, so
            // the user must bring one) from the hosted site (credits, with BYO key as the way
            // to keep going for free) without being told which it is.
            'server_key_available' => app(ShaderGenerator::class)->serverConfigured(),
            'accepts_user_keys' => (bool) config('services.shader.allow_user_keys'),
            'provider' => app(ShaderGenerator::class)->provider(),
            'model' => app(ShaderGenerator::class)->model(),
            // So a user bringing their own key can pick who to send it to. Names and labels
            // only - never an endpoint or anyone's key.
            'providers' => Providers::options(),
            'transactions' => $user->creditTransactions()
                ->latest()
                ->limit(50)
                ->get(['amount', 'reason', 'balance_after', 'created_at']),
        ]);
    }
}
