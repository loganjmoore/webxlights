/*{
  "DESCRIPTION": "Fireworks bursting outward with trails of light",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 1.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [1.0, 1.0, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 3.0, "DEFAULT": 1.5 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.5, "MAX": 3.0, "DEFAULT": 1.5 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  vec2 center = vec2(0.5, 0.5);
  vec2 delta = uv - center;
  float dist = length(delta);
  float angle = atan(delta.y, delta.x);
  
  float cycle = mod(TIME * speed, 2.0);
  float burst = smoothstep(0.8, 0.0, cycle);
  float fade = smoothstep(1.0, 0.3, cycle);
  
  float waveSpeed = cycle * scale * 1.2;
  float particleTrail = smoothstep(waveSpeed + 0.15, waveSpeed - 0.05, dist);
  
  vec3 color = mix(colorA.rgb, mix(colorB.rgb, colorC.rgb, sin(angle * 4.0) * 0.5 + 0.5), burst);
  
  float sparkle = sin(angle * 12.0 + TIME * speed * 3.0) * 0.5 + 0.5;
  sparkle = smoothstep(0.7, 1.0, sparkle);
  
  float intensity = particleTrail * fade * (1.0 + sparkle * 0.5);
  intensity *= smoothstep(0.6, 0.0, dist);
  
  gl_FragColor = vec4(color * intensity, 1.0);
}
