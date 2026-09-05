/*{
  "DESCRIPTION": "Distant lightning flashing behind clouds, brief flares over a dark sky, never uncomfortable",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.2, 0.3, 0.8, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.9, 0.95, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 }
  ]
}*/
float hash(float n) {
  return fract(sin(n * 91.7) * 43758.5453);
}
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;
  // 100 * 0.5 is whole: a flash slot every two seconds at speed 1, wrapping cleanly. Never more
  // than one flash per slot, so the rate can never exceed the photosensitivity limit.
  float t = mod(TIME * speed, 100.0) * 0.5;
  float slot = floor(t);
  float age = fract(t);
  float h = hash(slot);
  // The flash: a fast rise and a longer decay, at a moment in the slot that varies; skipped
  // entirely one slot in three, because lightning is not a metronome.
  float when = 0.1 + 0.5 * hash(slot + 7.0);
  float since = age - when;
  float flare = step(0.0, since) * exp(-since * 9.0) * step(0.34, h);
  // Where it is: behind one part of the cloud, not the whole sky.
  float x = isLine ? uv.x : uv.x;
  float where = hash(slot + 13.0);
  float local = smoothstep(0.6, 0.0, abs(x - where));
  // Clouds: slow soft bands, lit dimly all the time so the sky is never off.
  float y = isLine ? 0.5 : uv.y;
  float clouds = 0.5 + 0.5 * sin(x * 5.0 + mod(TIME * speed, 62.831853) * 0.3) * sin(y * 4.0 + 1.0);
  float sky = 0.45 + 0.3 * clouds;
  vec3 col = colorA.rgb * sky;
  col = mix(col, colorB.rgb, flare * (0.35 + 0.65 * local));
  gl_FragColor = vec4(col, 1.0);
}
