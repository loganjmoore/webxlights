/*{
  "DESCRIPTION": "A slow breathing glow that pulses gently between two colours",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.1, 0.1, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 0.8, 0.2, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "minBrightness", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.25 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;

  float breath = 0.5 + 0.5 * sin(TIME * speed * 0.6);
  breath = smoothstep(0.0, 1.0, breath);

  float brightness = mix(minBrightness, 1.0, breath);

  vec3 col = mix(colorA.rgb, colorB.rgb, breath);
  col *= brightness;

  float vign = 1.0 - 0.15 * length(uv - 0.5);
  col *= vign;

  gl_FragColor = vec4(col, 1.0);
}
