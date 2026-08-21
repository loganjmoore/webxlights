/*{
  "DESCRIPTION": "A spinning tunnel you fly into",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.1, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 0.2, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.1, "MAX": 12.0, "DEFAULT": 4.0 },
    { "NAME": "twist", "TYPE": "float", "MIN": 0.0, "MAX": 8.0, "DEFAULT": 2.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  // When the canvas is very short (a roofline), drive the same animation along X
  if (RENDERSIZE.y < 2.0) {
    uv.y = uv.x;
  }

  // Keep aspect ratio so tunnel looks circular
  float aspect = RENDERSIZE.x / max(1.0, RENDERSIZE.y);
  vec2 p = (uv - vec2(0.5, 0.5)) * vec2(aspect, 1.0) * 2.0;

  float eps = 0.0001;
  float r = length(p) + eps;
  float a = atan(p.y, p.x); // angle in radians

  // Motion parameters
  float t = TIME;
  float sp = speed;
  float sc = max(0.1, scale);
  float tw = twist;

  // Spin increases as we "fly" deeper (r smaller -> stronger twist)
  float spin = t * sp * 1.6 + tw / (r + 0.08);

  // Spiral and radial waves combine to make arms and rings that move inward
  float spiral = sin(a * 6.0 + spin); // 6 arms around the tunnel
  float radial = sin((1.0 / (r + 0.06)) * sc + t * sp * 3.0);

  // Combine waves and sharpen contrasts for bright, saturated bands
  float combined = spiral * 0.6 + radial * 0.8;
  float band = smoothstep(-0.15, 0.15, combined); // main bright bands
  float bandSharp = pow(band, 1.2);

  // Moving thin rings (pulses) for a sense of travel
  float ringPhase = fract((1.0 / (r + 0.06)) * sc + t * sp * 2.0);
  float ringPulse = smoothstep(0.58, 0.62, ringPhase);

  // Radial falloff so center is bright and edges dark (gives perspective)
  float centerFade = 1.0 - smoothstep(0.0, 1.4, r);
  centerFade = pow(centerFade, 0.7);

  // Add subtle streaks along the twist direction for motion lines
  float streak = pow(max(0.0, cos(spin * 4.0) * (0.8 - r)), 2.0);

  // Mix the two user colors according to the wave pattern
  vec3 baseColor = mix(colorA.rgb, colorB.rgb, 0.5 + 0.5 * sin(combined * 3.14159));

  // Final brightness: combine banding, ring pulses, center glow and streaks
  float brightness = clamp(centerFade * (0.6 + 0.9 * bandSharp) + 1.2 * ringPulse + 1.0 * streak, 0.0, 3.0);

  // Boost saturation and contrast for night-time display
  vec3 col = pow(baseColor, vec3(0.9)) * brightness;

  // Clamp and output opaque color
  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
