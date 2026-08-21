/*{
  "DESCRIPTION": "Alternating flashes between the first two chosen colors",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "sharpness", "TYPE": "float", "MIN": 0.01, "MAX": 1.0, "DEFAULT": 0.6 },
    { "NAME": "segments", "TYPE": "long", "MIN": 1, "MAX": 32, "DEFAULT": 1 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;

  // Primary axis for the pattern: use X so rooflines read correctly.
  float axis = uv.x;

  // Ensure segments as a float and never below 1.0
  float segs = max(1.0, float(segments));

  // Which segment this pixel falls into (0..segs-1)
  float segIndex = floor(axis * segs);

  // Alternate phase by parity so neighboring segments flash opposite each other
  float parity = mod(segIndex, 2.0);

  // Oscillator: 2*pi * TIME * speed, parity adds pi to invert every other segment
  const float TWO_PI = 6.28318531;
  const float PI = 3.14159265;
  float phase = TIME * speed * TWO_PI + parity * PI;

  // Sine-based beat for smooth continuous flashing
  float beat = sin(phase);

  // Use sharpness to control transition width: small -> crisp flashes
  float sh = clamp(sharpness, 0.01, 1.0);
  float t = smoothstep(-sh, sh, beat);

  // Mix between the two user colors
  vec3 color = mix(colorB.rgb, colorA.rgb, t);

  gl_FragColor = vec4(color, 1.0);
}
