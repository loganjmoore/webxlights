<?php

namespace App\Services\Shader;

use Exception;

/**
 * The provider answered, but not with anything usable: a refusal, a reply cut off at the token
 * limit, or text that is not the JSON the schema asked for.
 *
 * Not a RuntimeException on purpose. A RuntimeException from a driver means "not configured, or
 * the provider refused the request", which callers report as 503; this is a failed call, and a
 * retry might well succeed.
 */
class UnusableOutput extends Exception {}
