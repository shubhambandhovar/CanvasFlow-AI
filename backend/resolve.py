import dns.resolver

try:
    res = dns.resolver.Resolver(configure=False)
    res.nameservers = ['8.8.8.8']
    
    # Get SRV records
    srv_answers = res.resolve('_mongodb._tcp.cluster0.wjwmdfq.mongodb.net', 'SRV')
    hosts = []
    for r in srv_answers:
        target = r.target.to_text().strip('.')
        port = r.port
        hosts.append(f"{target}:{port}")
        
    print("HOSTS:", ",".join(hosts))
    
    # Get TXT records
    txt_answers = res.resolve('cluster0.wjwmdfq.mongodb.net', 'TXT')
    for r in txt_answers:
        print("TXT:", r.to_text())
        
except Exception as e:
    print("ERROR:", e)
