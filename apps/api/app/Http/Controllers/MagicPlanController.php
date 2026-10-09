<?php

namespace App\Http\Controllers;

use App\Models\Sequence;
use App\Services\Magic\MagicDirector;
use App\Services\Magic\RoleEffects;
use App\Services\Shader\RequestScreen;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use RuntimeException;
use Throwable;

// Magic Sequence's AI director: song and prop summaries in, a validated partial ShowPlan out.
//
// Funded exactly like the shader assistant (ShaderGenerationController): a caller's own key
// bills them and bypasses the caps, the server's key spends the operator's money against a daily
// and monthly allowance counted from the credit ledger. The allowances are this feature's own.
// Its ledger rows carry their own reasons, so a plan never uses up a shader generation or the
// other way round, and a refund here cannot hand back a slot there.
//
// Nothing here is allowed to be fatal to the sequence. The browser has a rules director that
// needs no server, so every non-200 means "use that", and a partial plan is filled from it too.
class MagicPlanController extends Controller
{
    // The allowance, not a balance, is the gate; each press is a ledger row so the count and any
    // bill cannot disagree.
    private const COST = 0;

    public function plan(Request $request, Sequence $sequence, MagicDirector $director)
    {
        $user = $request->user();
        $sequence->project->authorize($user, 'editor');
        $data = $request->validate($this->rules());

        // Headers, never the body, for the same reasons as the shader assistant: a key must not
        // end up in a payload log or a pasted bug report. Used for this call and then gone.
        $userKey = trim((string) $request->header('X-Shader-Key', ''));
        $ownKey = $userKey !== '';
        $userProvider = $ownKey ? ($request->header('X-Shader-Provider') ?: null) : null;
        $userModel = $ownKey ? ($request->header('X-Shader-Model') ?: null) : null;

        if ($ownKey && ! config('services.shader.allow_user_keys')) {
            return response()->json(['message' => 'This server does not accept user-supplied API keys.'], 403);
        }

        // Refuse before spending, own key or not: the screen runs ahead of the ledger and the
        // provider, so a refusal costs nobody anything.
        foreach (['direction', 'edit'] as $said) {
            if (isset($data[$said]) && $refusal = app(RequestScreen::class)->refusalForDirection($data[$said])) {
                return response()->json(['message' => $refusal, 'code' => 'off_topic'], 422);
            }
        }

        if (! $ownKey && ($limit = (int) config('services.magic.daily_limit')) > 0 && $this->usedSince($user, now('UTC')->startOfDay()) >= $limit) {
            return response()->json([
                'message' => "You have used today's {$limit} free AI director plans. The limit resets at midnight UTC"
                    .' - or add your own API key in Settings to keep going now.',
                'code' => 'daily_limit',
                'daily_limit' => $limit,
                'resets_at' => now('UTC')->addDay()->startOfDay()->toIso8601String(),
                'credits' => $user->credits,
            ], 429);
        }

        if (! $ownKey && ($monthly = (int) config('services.magic.monthly_limit')) > 0 && $this->usedSince($user, now('UTC')->startOfMonth()) >= $monthly) {
            return response()->json([
                'message' => "You have used this month's {$monthly} free AI director plans. The allowance resets on the 1st"
                    .' - or add your own API key to keep going now.',
                'code' => 'monthly_limit',
                'monthly_limit' => $monthly,
                'resets_at' => now('UTC')->addMonthNoOverflow()->startOfMonth()->toIso8601String(),
                'credits' => $user->credits,
            ], 429);
        }

        // Recorded before the call: it costs real money the moment it is made, so the row that
        // counts it must exist even if the response is lost. Refunded below if nothing came back.
        $meta = ['sequence' => $sequence->id];
        if (! $ownKey) {
            $user->moveCredits(-self::COST, 'magic_plan', $meta);
        }

        try {
            $result = $director->plan($data, $ownKey ? $userKey : null, $userProvider, $userModel);
        } catch (RuntimeException $e) {
            if (! $ownKey) {
                $user->moveCredits(self::COST, 'magic_plan_refund', [...$meta, 'error' => $e->getMessage()]);
            }

            return response()->json(['message' => $e->getMessage()], 503);
        } catch (Throwable $e) {
            // Includes a refusal, a cut-off reply and invalid JSON (UnusableOutput).
            if (! $ownKey) {
                $user->moveCredits(self::COST, 'magic_plan_refund', [...$meta, 'error' => class_basename($e)]);
            }
            report($e);

            return response()->json(['message' => 'The AI director could not be reached. Using the rules director instead.'], 502);
        }

        // Objects even when empty or keyed 0, 1, 2: the browser reads these as records, and PHP
        // would otherwise write a list.
        $plan = $result['plan'];
        if (isset($plan['palettes'])) {
            $plan['palettes'] = (object) $plan['palettes'];
        }

        return response()->json([
            'plan' => (object) $plan,
            'dropped' => $result['dropped'],
            'charged' => ! $ownKey,
            'usage' => $result['usage'],
            'model' => $result['model'],
        ]);
    }

    /** What the UI needs to decide whether to offer the AI director, and how much is left. */
    public function status(Request $request, MagicDirector $director)
    {
        $user = $request->user();
        $daily = (int) config('services.magic.daily_limit');
        $monthly = (int) config('services.magic.monthly_limit');

        return response()->json([
            'available' => $director->serverConfigured(),
            'accepts_user_keys' => (bool) config('services.shader.allow_user_keys'),
            'model' => $director->resolve()['model'],
            // Zero means the operator turned the cap off.
            'daily_limit' => $daily,
            'used_today' => $daily > 0 ? $this->usedSince($user, now('UTC')->startOfDay()) : 0,
            'monthly_limit' => $monthly,
            'used_this_month' => $monthly > 0 ? $this->usedSince($user, now('UTC')->startOfMonth()) : 0,
        ]);
    }

    /**
     * Server-funded plans since a moment, refunds subtracted: a plan that failed gave the user
     * nothing, so it gives the slot back. Counted from the ledger so the cap and the bill agree.
     * Only this feature's reasons are counted, which keeps it apart from the shader assistant.
     */
    private function usedSince($user, $since): int
    {
        $rows = $user->creditTransactions()->where('created_at', '>=', $since);

        return max(0, (clone $rows)->where('reason', 'magic_plan')->count()
            - (clone $rows)->where('reason', 'magic_plan_refund')->count());
    }

    private function rules(): array
    {
        return [
            'song' => ['required', 'array'],
            'song.title' => ['nullable', 'string', 'max:200'],
            'song.artist' => ['nullable', 'string', 'max:200'],
            'song.bpm' => ['required', 'numeric', 'between:40,250'],
            'song.durationMs' => ['required', 'integer', 'min:1'],
            'song.sections' => ['bail', 'required', 'array', 'min:1', 'max:64', function ($attribute, $sections, $fail) {
                // The plan refers to sections by position, so the list must be 0..n-1 in order.
                foreach (array_values($sections) as $i => $section) {
                    if ((is_array($section) ? ($section['index'] ?? null) : null) !== $i) {
                        $fail('The section indexes must run 0 to n-1 in order.');

                        return;
                    }
                }
            }],
            'song.sections.*.index' => ['required', 'integer', 'min:0'],
            'song.sections.*.label' => ['required', Rule::in(['intro', 'verse', 'prechorus', 'chorus', 'bridge', 'breakdown', 'solo', 'outro'])],
            'song.sections.*.bars' => ['required', 'integer', 'min:1'],
            'song.sections.*.energy' => ['required', 'numeric', 'between:0,1'],
            'song.sections.*.rank' => ['required', 'integer', 'min:0'],
            // Empty means "no repeat group", which the middleware turns into null.
            'song.sections.*.group' => ['nullable', 'string', 'max:4'],
            'song.sections.*.hits' => ['required', 'integer', 'min:0'],
            'props' => ['required', 'array'],
            'props.roles' => ['required', 'array', 'min:1', 'max:64'],
            'props.roles.*.role' => ['required', Rule::in(array_keys(RoleEffects::table()))],
            'props.roles.*.count' => ['required', 'integer', 'min:1'],
            'props.roles.*.tier' => ['required', Rule::in(['hero', 'feature', 'frame', 'fill'])],
            'props.groups' => ['nullable', 'array', 'max:40'],
            'props.groups.*' => ['string', 'max:100'],
            'feel' => ['required', Rule::in(['auto', 'traditional', 'joyful', 'peaceful', 'powerful', 'magical', 'rock'])],
            'style' => ['nullable', Rule::in(['show', 'classic'])],
            'direction' => ['nullable', 'string', 'max:500'],
            // A chat edit: the user's ask and the plan it changes. The plan is context for the
            // model only; what comes back is validated like any plan.
            'edit' => ['nullable', 'string', 'max:300', 'required_with:plan'],
            'plan' => ['nullable', 'array', 'required_with:edit'],
            'plan.sections' => ['required_with:plan', 'array', 'max:64'],
            'plan.palettes' => ['nullable', 'array', 'max:12'],
            'plan.seed' => ['nullable', 'integer'],
            'plan.ending' => ['nullable', 'string', 'max:20'],
            'plan.style' => ['nullable', 'string', 'max:20'],
            'plan.avoid' => ['nullable', 'array', 'max:40'],
            'plan.avoid.*' => ['string', 'max:40'],
        ];
    }
}
