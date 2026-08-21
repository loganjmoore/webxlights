/*{
  "DESCRIPTION": "Fireworks bursting outward from random points with fading trails",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 1.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [1.0, 1.0, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 3.0, "DEFAULT": 1.5 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.1, "MAX": 2.0, "DEFAULT": 1.0 }
  ]
}*/

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = isf_FragNormCoord;
  float t = TIME * speed;
  vec3 finalColor = vec3(0.0);
  
  for (int i = 0; i < 8; i++) {
    float idx = float(i);
    vec2 center = vec2(hash(vec2(idx, 1.2)), hash(vec2(idx, 3.4)));
    float burst_time = fract(t * 0.3 + idx * 0.125);
    float burst_age = burst_time;
    
    vec2 diff = uv - center;
    float dist = length(diff);
    
    float expand = burst_age * 0.5 * scale;
    float trail = smoothstep(expand + 0.08, expand - 0.02, dist);
    trail *= (1.0 - burst_age);
    
    vec3 burst_color = mix(colorA.rgb, mix(colorB.rgb, colorC.rgb, hash(vec2(idx, 5.6))), hash(vec2(idx, 7.8)));
    finalColor += burst_color * trail;
  }
  
  finalColor = clamp(finalColor, vec3(0.0), vec3(1.0));
  gl_FragColor = vec4(finalColor, 1.0);
}
