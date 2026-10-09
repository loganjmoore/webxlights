<?php

namespace App\Services\Shader;

/**
 * The cheap check that runs before any money is spent.
 *
 * The hosted endpoint exists to make shaders, and every call to it spends the operator's money.
 * Scope control is built as layers, and this is the first one: a request that is visibly trying
 * to repurpose the assistant - prompt injection, "output your system prompt", "write me a
 * Python script" - is refused here, before a credit moves and before a provider is called.
 * The layers behind it are the output gate (whatever comes back must parse as ISF and compile,
 * so an essay never reaches a user - shaderDraft.ts) and, last and weakest, the system prompt's
 * own instruction that the description is data.
 *
 * Honesty about what this is: pattern matching. It stops the obvious and the automated, which
 * is most of the abuse by volume, and a determined person can phrase their way past it - at
 * which point the output gate makes the reward an ISF file or nothing. It is deliberately
 * narrow, because a false positive here refuses a paying user: "make it look like the matrix"
 * must pass, "ignore your instructions" must not. Every pattern is tested in ShaderScopeTest,
 * so loosening or tightening one is a visible decision.
 *
 * Magic Sequence's free-text direction goes through the same screen with its own topic
 * (refusalForDirection, tested in MagicScreenTest). Its output gate is the server's plan
 * validator, which keeps only enum values, hex colours and whitelisted effect names, so prose
 * has nowhere to go.
 */
class RequestScreen
{
    /**
     * Countermanding the instructions, as shader descriptions are screened. "previous" and
     * "above" on their own are enough here; the pattern has always been this wide.
     */
    private const COUNTERMAND = '/\b(ignore|disregard|forget|override)\b[^.]{0,60}\b(instructions?|rules?|prompts?|above|previous)\b/is';

    /**
     * The same, for a light-show direction, where "forget the previous section" and "ignore the
     * arches above the garage" are ordinary things to say. Only the unambiguous shapes count:
     * the instructions or rules themselves, "previous instructions", or "all of the above".
     */
    private const COUNTERMAND_SHOW = '/\b(ignore|disregard|forget|override)\b[^.]{0,60}\b(instructions?|rules?|prompts?|previous (instructions?|prompts?|rules?|messages?)|(all|everything)\b[^.]{0,15}\babove)\b/is';

    /** The shapes that are abuse whatever the endpoint is for. */
    private const COMMON = [
        // Impersonating a privileged role on its own line, the way transcripts look...
        '/^\s*(system|assistant|developer)\s*:/im',
        // ...re-roling the model, or asking what it was told.
        '/\byou are now\b|\bpretend (you are|to be)\b|\bjailbreak\b/i',
        '/\b(system|your)\s+(prompt|instructions?)\b/i',
    ];

    /**
     * Using the endpoint as a free code generator. GLSL never needs another language, so the
     * shader screen matches a language name anywhere near a code word.
     */
    private const CODE = [
        '/\b(python|javascript|typescript|bash|shell|powershell|php|sql|java|rust)\b[^.]{0,40}\b(script|program|code|function)\b/is',
        '/\b(script|program|code|function)\b[^.]{0,40}\b(python|javascript|typescript|bash|shell|powershell|php|sql|java|rust)\b/is',
    ];

    /**
     * The same for a direction, where "the Christmas program" and "sea shell pink" can share a
     * sentence: the language must sit right against the code word ("a Python script", "a script
     * in javascript").
     */
    private const CODE_SHOW = [
        '/\b(python|javascript|typescript|bash|shell|powershell|php|sql|java|rust)\s+(script|program|code|function)\b/i',
        '/\b(script|program|code|function)\s+(in|for|using|with|written in)\s+(python|javascript|typescript|bash|shell|powershell|php|sql|java|rust)\b/i',
    ];

    /**
     * Why this description is refused, or null when it looks like a real request.
     */
    public function refusalFor(string $description): ?string
    {
        return $this->offTopic($description, [self::COUNTERMAND, ...self::CODE])
            ? 'This assistant only writes light-display shaders. Describe the animation you want to see.'
            : null;
    }

    /**
     * The same screen for Magic Sequence's free-text direction ("make the tree the star of the
     * chorus"): same layer and same promises, but the message names the job that endpoint does
     * and the countermand pattern is narrowed so ordinary show talk passes.
     */
    public function refusalForDirection(string $direction): ?string
    {
        return $this->offTopic($direction, [self::COUNTERMAND_SHOW, ...self::CODE_SHOW])
            ? 'The director only plans light shows. Describe the look you want, for example "icy blue and white, driving pulse".'
            : null;
    }

    /** @param  string[]  $patterns  the topic's own patterns; the common ones are always added */
    private function offTopic(string $text, array $patterns): bool
    {
        foreach ([...$patterns, ...self::COMMON] as $pattern) {
            if (preg_match($pattern, $text)) {
                return true;
            }
        }

        return false;
    }
}
