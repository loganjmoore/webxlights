/*{
  "DESCRIPTION": "Swirling plasma effect with animated vortex patterns",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 1.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [1.0, 0.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.5, "MAX": 8.0, "DEFAULT": 2.0 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  vec2 center = vec2(0.5, 0.5);
  vec2 pos = uv - center;
  
  float angle = atan(pos.y, pos.x);
  float radius = length(pos);
  
  float time = TIME * speed * 0.5;
  
  float spiral1 = sin(angle * 3.0 + time - radius * scale * 4.0);
  float spiral2 = cos(angle * 2.0 + time * 0.7 + radius * scale * 3.0);
  float spiral3 = sin(angle + time * 1.3 - radius * scale * 2.0);
  
  float pattern = spiral1 * 0.4 + spiral2 * 0.35 + spiral3 * 0.25;
  pattern += sin(radius * scale * 6.0 - time) * 0.3;
  
  float intensity = smoothstep(0.0, 1.0, fract(pattern));
  
  vec3 color = mix(colorA.rgb, colorB.rgb, fract(spiral1 * 0.5 + time));
  color = mix(color, colorC.rgb, fract(spiral2 * 0.5));
  
  color *= intensity;
  
  gl_FragColor = vec4(color, 1.0);
}
