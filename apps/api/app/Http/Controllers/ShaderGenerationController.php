<?php

namespace App\Http\Controllers;

use App\Services\ShaderGenerator;
use Illuminate\Http\Request;
use RuntimeException;
use Throwable;

// The shader assistant: a sentence in, an ISF shader out, one credit spent.
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

        // Debited before the call, not after. The generation is the thing being paid for and it
        // costs real money the moment it is made, so a failure to bill has to stop the request
        // rather than be noticed afterwards. Refunded below if the call itself fails, which is
        // the case where the user got nothing.
        $meta = ['description' => mb_substr($data['description'], 0, 200)];
        if (! $user->moveCredits(-self::COST, 'shader_generation', $meta)) {
            return response()->json([
                'message' => 'You are out of credits.',
                'credits' => $user->credits,
                'code' => 'insufficient_credits',
            ], 402);
        }

        try {
            $result = $generator->generate(
                $data['description'],
                $data['previous_source'] ?? null,
                $data['compile_error'] ?? null,
            );
        } catch (RuntimeException $e) {
            // Not configured, or refused. The user gets their credit back and a straight answer.
            $user->moveCredits(self::COST, 'refund', [...$meta, 'error' => $e->getMessage()]);

            return response()->json(['message' => $e->getMessage(), 'credits' => $user->credits], 503);
        } catch (Throwable $e) {
            $user->moveCredits(self::COST, 'refund', [...$meta, 'error' => class_basename($e)]);
            report($e);

            return response()->json([
                'message' => 'The shader assistant could not be reached. Your credit was returned.',
                'credits' => $user->credits,
            ], 502);
        }

        return response()->json([
            'source' => $result['source'],
            'credits' => $user->credits,
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
            'transactions' => $user->creditTransactions()
                ->latest()
                ->limit(50)
                ->get(['amount', 'reason', 'balance_after', 'created_at']),
        ]);
    }
}
