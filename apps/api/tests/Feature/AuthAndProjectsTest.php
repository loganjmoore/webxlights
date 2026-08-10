<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthAndProjectsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // Sanctum's EnsureFrontendRequestsAreStateful only boots session middleware
        // for requests whose Referer matches SANCTUM_STATEFUL_DOMAINS.
        $this->withHeader('Referer', 'http://localhost:5173');
    }

    public function test_a_user_can_register_and_is_logged_in(): void
    {
        $response = $this->postJson('/api/auth/register', [
            'name' => 'Logan',
            'email' => 'logan@example.com',
            'password' => 'correct-horse',
            'password_confirmation' => 'correct-horse',
        ]);

        $response->assertCreated()->assertJsonPath('email', 'logan@example.com');
        $this->assertAuthenticated();
    }

    public function test_projects_endpoint_requires_authentication(): void
    {
        $this->getJson('/api/v1/projects')->assertUnauthorized();
    }

    public function test_a_user_can_create_and_list_only_their_own_projects(): void
    {
        $me = User::factory()->create();
        $other = User::factory()->create();
        Project::factory()->for($other, 'owner')->create(['name' => 'Not mine']);

        $response = $this->actingAs($me)->postJson('/api/v1/projects', ['name' => '2026 Test Show']);
        $response->assertCreated()->assertJsonPath('name', '2026 Test Show');

        $list = $this->actingAs($me)->getJson('/api/v1/projects');
        $list->assertOk()->assertJsonCount(1)->assertJsonPath('0.name', '2026 Test Show');
    }
}
