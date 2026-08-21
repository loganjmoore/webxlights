/*{
  "DESCRIPTION": "A chase of colored dots runs continuously along the roofline",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "count", "TYPE": "float", "MIN": 2.0, "MAX": 16.0, "DEFAULT": 8.0 },
    { "NAME": "sharpness", "TYPE": "float", "MIN": 0.05, "MAX": 0.5, "DEFAULT": 0.2 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;

  // Use x along the roofline always; if buffer is tall (not a roofline),
  // still favor x-driven motion per the instructions.
  float pos = uv.x;

  // moving coordinate along the chase, wraps seamlessly
  float t = fract(pos * count - TIME * speed);

  // distance to nearest dot center in wrapped space
  float d = min(t, 1.0 - t);

  // sharp-edged dot with soft falloff for anti-alias
  float dot = smoothstep(sharpness, sharpness * 0.5, d);

  // cycle through three colors based on which light index we're at
  float idx = floor(pos * count - TIME * speed);
  float cyc = mod(idx, 3.0);

  vec3 col = colorA.rgb;
  if (cyc > 0.5 && cyc < 1.5) {
    col = colorB.rgb;
  } else if (cyc >= 1.5) {
    col = colorC.rgb;
  }

  // dim background so unlit gaps read as "off" but not pure black harshness
  vec3 background = vec3(0.02, 0.02, 0.03);

  vec3 finalColor = mix(background, col, dot);

  gl_FragColor = vec4(finalColor, 1.0);
}
