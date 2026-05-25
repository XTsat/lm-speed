'use client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { speedTestSchema, modelSchema, type SpeedTestInput } from '@/lib/schema'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { type SpeedTestResult } from '@/db/schema'
import { Button } from './ui/button'
import { useTranslations } from 'next-intl'
import { z } from 'zod'
import { toast } from 'sonner'
import { Checkbox } from '@/components/ui/checkbox'
import { handleToImage } from '@/lib/tool'
import { ResultsList } from './results-list'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { Input } from './ui/input'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { saveTestResult } from '@/lib/local-storage'

type SpeedTestResultCard = SpeedTestResult & {
	status?: 'pending' | 'running' | 'completed'
}

export function SpeedTestForm() {
	const t = useTranslations('SpeedTest')
	const tRank = useTranslations('rank')
	const [loading, setLoading] = useState(false)
	const [results, setResults] = useState<SpeedTestResultCard[] | null>(null)
	const [progress, setProgress] = useState<number>(0)
	const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
	const [streamContents, setStreamContents] = useState<{
		[key: number]: string
	}>({})
	const [models, setModels] = useState<Array<{ id: string }>>([])
	const [isFechingModel, setIsFechingModel] = useState(false)

	const contentRef = useRef<{ [key: number]: string }>({})

	const TEST_PROMPTS = useMemo(() => [
		'Explain the concept of quantum computing in simple terms.',
		'Write a short story about a robot learning to paint.',
		'What are the main differences between REST and GraphQL?',
		'Describe the taste of your favorite food.',
		'How does photosynthesis work?',
	], [])

	const {
		register,
		handleSubmit,
		formState: { errors },
		getValues,
		setValue,
	} = useForm<SpeedTestInput>({
		resolver: zodResolver(speedTestSchema),
	})

	const [rememberApiKey, setRememberApiKey] = useState(true)

	// Function to parse URL parameters
	const getUrlParams = () => {
		if (typeof window !== 'undefined') {
			const searchParams = new URLSearchParams(window.location.search);
			return {
				baseUrl: searchParams.get('baseUrl'),
				apiKey: searchParams.get('apiKey'),
				modelId: searchParams.get('modelId'),
			};
		}
		return { baseUrl: null, apiKey: null, modelId: null };
	};

	const fetchModels = async (baseUrl: string, apiKey: string) => {
		setIsFechingModel(true)
		baseUrl = baseUrl.trim()
		try {
			if (rememberApiKey) {
				localStorage.setItem('speedtest_apiKey', apiKey)
			}
			modelSchema.parse({ baseUrl, apiKey })
			localStorage.setItem('speedtest_baseUrl', baseUrl)
			const response = await fetch('/api/model', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ baseUrl, apiKey }),
			})

			if (!response.ok) {
				throw new Error('Failed to fetch models')
			}

			const data = await response.json()
			if (data.models) {
				setModels(data.models)
			}
		} catch (error) {
			if (error instanceof z.ZodError) {
				// 添加更好的 null 检查
				if (error.errors && error.errors.length > 0) {
					toast.error(error.errors[0].message)
				} else {
					toast.error('Validation error')
				}
			} else {
				console.error('Error fetching models:', error)
				toast.error(error instanceof Error ? error.message : 'Failed to fetch models')
			}
		}
		setIsFechingModel(false)
	}

	const onSubmit = useCallback(async (data: SpeedTestInput) => {
		try {
			setLoading(true)
			contentRef.current = {}

			const initialResults = TEST_PROMPTS.map((prompt) => ({
				prompt,
				model: data.modelId,
				firstTokenLatency: 0,
				tokensPerSecond: 0,
				tokensPerSecondTotal: 0,
				outputToken: 0,
				totalTime: 0,
				outputTime: 0,
				status: 'pending' as const,
			}))
			setResults(initialResults)
			setProgress(0)
			setStreamContents({})
			data.baseUrl = data.baseUrl.trim()
			localStorage.setItem('speedtest_baseUrl', data.baseUrl)
			localStorage.setItem('speedtest_modelId', data.modelId)
			if (rememberApiKey) {
				localStorage.setItem('speedtest_apiKey', data.apiKey)
			} else {
				localStorage.removeItem('speedtest_apiKey')
			}

			const response = await fetch('/api/speed/test', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data),
			})

			// 添加更详细的错误处理
			if (!response.ok) {
				let errorMsg = `Failed to perform speed test (${response.status})`;
				try {
					const errorData = await response.json();
					if (errorData?.error) {
						errorMsg = errorData.error;
					}
				} catch (e) {
					// 如果无法解析 JSON，使用默认错误消息
				}
				throw new Error(errorMsg);
			}

			if (!response.body) {
				throw new Error('No response body from server');
			}

			const reader = response.body.getReader()
			const decoder = new TextDecoder()

			let updateTimer: number | null = null

			const startPeriodicUpdate = () => {
				updateTimer = window.setInterval(() => {
					setStreamContents({ ...contentRef.current })
				}, 16) as unknown as number
			}

			startPeriodicUpdate()

			try {
				while (true) {
					const { value, done } = await reader.read()
					if (done) break

					const chunk = decoder.decode(value)
					const lines = chunk.split('\n').filter(Boolean)

					for (const line of lines) {
						try {
							const message = JSON.parse(line)

							switch (message.type) {
								case 'start':
									setResults((prev) => {
										if (!prev) return prev
										const newResults = [...prev]
										newResults[message.data.index] = {
											...newResults[message.data.index],
											status: 'running',
										}
										return newResults
									})
									setExpandedIndex(message.data.index)
									contentRef.current[message.data.index] = ''
									console.log(
										`#content-${message.data.index}`,
										document.querySelector(`#content-${message.data.index}`)
									)
									setTimeout(() => {
										document
											.querySelector(`#content-${message.data.index}`)
											?.scrollIntoView({
												behavior: 'smooth',
												block: 'center',
											})
									}, 300)

									break
								case 'content':
									contentRef.current[message.data.index] =
										(contentRef.current[message.data.index] || '') + message.data.content
									setResults((prev) => {
										if (!prev) return prev
										const newResults = [...prev]
										newResults[message.data.index] = {
											...newResults[message.data.index],
											tokensPerSecond: message.data.currentSpeed,
											tokensPerSecondTotal: message.data.currentTotalSpeed,
											outputToken: message.data.currentTokens,
											outputTime: message.data.elapsedTime,
										}
										return newResults
									})
									break
								case 'result':
									setResults((prev) => {
										if (!prev) return prev
										const newResults = [...prev]
										newResults[message.data.index] = {
											...message.data,
											status: 'completed',
										}
										return newResults
									})
									setProgress(((message.data.index + 1) / TEST_PROMPTS.length) * 100)
									break
								case 'error':
									throw new Error(message.error)
								case 'complete':
									// 保存测试结果到 localStorage
									if (results && results.length > 0) {
										const testResultToSave = {
											id: Date.now().toString(),
											timestamp: new Date().toISOString(),
											baseUrl: data.baseUrl,
											results: results.map(r => ({
												prompt: r.prompt,
												model: r.model,
												firstTokenLatency: r.firstTokenLatency,
												tokensPerSecond: r.tokensPerSecond,
												tokensPerSecondTotal: r.tokensPerSecondTotal,
												outputToken: r.outputToken,
												totalTime: r.totalTime,
												outputTime: r.outputTime,
												content: contentRef.current[results.indexOf(r)] || ''
											}))
										}
										saveTestResult(testResultToSave)
										toast.success('测试结果已保存')
										
										// 发送自定义事件通知其他页面更新数据
										window.dispatchEvent(new Event('lm-speed-test-completed'))
									}
									setTimeout(() => setExpandedIndex(null), 1000)
									setTimeout(() => {
										document.querySelector(`#summary`)?.scrollIntoView({
											behavior: 'smooth',
											block: 'center',
										})
									}, 300)
									break
							}
						} catch (error) {
							console.error('Error parsing stream:', error)
							toast.error(error instanceof Error ? error.message : 'An error occurred', {
								duration: 30000,
							})
						}
					}
				}
			} finally {
				if (updateTimer !== null) {
					clearInterval(updateTimer)
				}
			}
		} catch (error) {
			console.error('Error:', error)
			toast.error(error instanceof Error ? error.message : 'An error occurred', { duration: 30000 })
		} finally {
			setLoading(false)
		}
	}, [TEST_PROMPTS, rememberApiKey])


	
	useEffect(() => {
		const savedBaseUrl = localStorage.getItem('speedtest_baseUrl')
		const savedModelId = localStorage.getItem('speedtest_modelId')
		const savedApiKey = localStorage.getItem('speedtest_apiKey')
		
		// Check URL parameters first
		const urlParams = getUrlParams();
		
		if (urlParams.baseUrl) {
			setValue('baseUrl', urlParams.baseUrl);
		} else if (savedBaseUrl) {
			setValue('baseUrl', savedBaseUrl);
		}
		
		if (urlParams.modelId) {
			setValue('modelId', urlParams.modelId);
		} else if (savedModelId) {
			setValue('modelId', savedModelId);
		}
		
		if (urlParams.apiKey) {
			setValue('apiKey', urlParams.apiKey);
			setRememberApiKey(true);
		} else if (savedApiKey) {
			setValue('apiKey', savedApiKey);
			setRememberApiKey(true);
		}
		
		// If all three parameters are present in URL, start speed test automatically
		if (urlParams.baseUrl && urlParams.apiKey && urlParams.modelId) {
			// Add the model to the models list if not already present
			setModels(prev => {
				if (!prev.some(model => model.id === urlParams.modelId)) {
					return [...prev, { id: urlParams.modelId! }];
				}
				return prev;
			});
			
			// Trigger the form submission after a short delay to ensure form is ready
			setTimeout(() => {
				handleSubmit(onSubmit)();
			}, 500);
		} else if (savedBaseUrl && savedApiKey) {
			//   fetchModels(savedBaseUrl, savedApiKey);
		}
	}, [setValue, handleSubmit, onSubmit])

	const [open, setOpen] = useState(false)

	return (
		<div className="container mx-auto px-4 sm:px-0">
			<div className="bg-gray-50 p-4 sm:p-6 rounded-lg">
				<form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
					<div className="space-y-2">
						<label className="text-sm text-gray-600">{t('form.baseUrl.label')}</label>
						<Input
							{...register('baseUrl')}
							className="w-full p-2 border-2 rounded-md bg-transparent text-gray-700"
							placeholder="https://api.deepseek.com/v1"
						/>
						{errors.baseUrl && <p className="text-rose-400 text-sm">{errors.baseUrl.message}</p>}
					</div>

					<div className="space-y-2">
						<label className="text-sm text-gray-600">{t('form.apiKey.label')}</label>
						<Input
							{...register('apiKey')}
							type="password"
							className="w-full p-2 border-2 rounded-md bg-transparent text-gray-700"
						/>
						{errors.apiKey && <p className="text-rose-400 text-sm">{errors.apiKey.message}</p>}
						<div className="flex flex-row justify-between gap-1">
							<p className="text-xs text-gray-500">{t('form.apiKey.disclaimer')}</p>
							<div className="flex items-center gap-2">
								<Checkbox
									id="rememberApiKey"
									checked={rememberApiKey}
									onCheckedChange={(checked) => setRememberApiKey(checked === true)}
								/>
								<label htmlFor="rememberApiKey" className="text-xs text-gray-500">
									{t('form.apiKey.remember')}
								</label>
							</div>
						</div>
					</div>

					<div className="space-y-2">
						<label className="text-sm text-gray-600">{t('form.modelId.label')}</label>
						<div className="flex flex-row gap-2">
							<div className="relative w-full">
								<Popover open={open} onOpenChange={setOpen}>
									<PopoverTrigger asChild>
										<Button
											variant="outline"
											role="combobox"
											aria-expanded={open}
											className="w-full justify-between bg-transparent border-2"
											onClick={() => {
												if (!isFechingModel) {
													fetchModels(getValues('baseUrl'), getValues('apiKey'))
												}
											}}
										>
											{getValues('modelId')
												? models.find((model) => model.id === getValues('modelId'))
														?.id
												: 'Select framework...'}
											<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
										</Button>
									</PopoverTrigger>
									<PopoverContent align="start" className="w-[500px] p-0">
										<Command>
											<CommandInput placeholder="Search framework..." />
											<CommandList>
												<CommandEmpty>No framework found.</CommandEmpty>
												<CommandGroup>
													{models.map((model) => (
														<CommandItem
															key={model.id}
															value={model.id}
															onSelect={(currentValue) => {
																setValue('modelId', currentValue)
																setOpen(false)
															}}
														>
															<Check
																className={cn(
																	'mr-2 h-4 w-4',
																	getValues('modelId') === model.id
																		? 'opacity-100'
																		: 'opacity-0'
																)}
															/>
															{model.id}
														</CommandItem>
													))}
												</CommandGroup>
											</CommandList>
											<div className="p-2 flex flex-row gap-2">
												<Input {...register('modelId')} className="h-9" />
												<Button
													size="sm"
													onClick={() => {
														setModels((prev) => [
															...prev,
															{ id: getValues('modelId') },
														])
													}}
												>
													Add
												</Button>
											</div>
										</Command>
									</PopoverContent>
								</Popover>
							</div>
						</div>

						{errors.modelId && <p className="text-rose-400 text-sm">{errors.modelId.message}</p>}
					</div>

					<Button
						type="submit"
						disabled={loading || models.length === 0}
						className="w-full py-2 shadow-none transition-colors"
					>
						{loading ? (
							<div className="flex items-center justify-center space-x-2">
								<span>{t('form.submit.running')}</span>
								<span>{progress.toFixed(0)}%</span>
							</div>
						) : (
							t('form.submit.default')
						)}
					</Button>
				</form>
			</div>

			{results && (
				<>
					<div className="flex justify-center gap-4 mt-8">
						<Button className="rounded-full" onClick={() => handleToImage('summary')}>
							下载汇总报告
						</Button>
						<Button
							variant="outline"
							className="rounded-full"
							onClick={() => handleToImage('result')}
						>
							下载完整测试报告
						</Button>
					</div>
					<div id="result" className="my-8">
						{results.every((result) => result.status === 'completed') && (
							<div id="summary" className="mb-8 p-6 bg-[#17181C] rounded-lg">
								<h3 className="text-lg font-semibold text-white mb-1">
									<span>LM Speed {t('results.summary.title')}</span>
								</h3>
								<div className="text-sm font-normal mb-4">
									<span className="text-gray-400 mr-2">Model:</span>
									<span className="text-white mr-8">{results[0].model}</span>
									<span className="text-gray-400 mr-2">Base URL:</span>
									<span className="text-white">{new URL(getValues('baseUrl')).host}</span>
								</div>
								<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
									<div>
										<p className="text-sm text-gray-400">{tRank('table.avgLatency')}</p>
										<p className="text-2xl font-medium text-white">
											{(
												results.reduce((acc, cur) => acc + cur.firstTokenLatency, 0) /
												results.length /
												1000
											).toFixed(2)}
											s
										</p>
										<div className="mt-4">
											<p className="text-sm text-gray-400">
												{t('results.summary.maxFirstTokenLatency')}
											</p>
											<p className="text-base text-white">
												{(
													Math.max(...results.map((r) => r.firstTokenLatency)) /
													1000
												).toFixed(2)}
												s
											</p>
										</div>
										<div className="mt-2">
											<p className="text-sm text-gray-400">
												{t('results.summary.minFirstTokenLatency')}
											</p>
											<p className="text-base text-white">
												{(
													Math.min(...results.map((r) => r.firstTokenLatency)) /
													1000
												).toFixed(2)}
												s
											</p>
										</div>
									</div>
									<div>
										<p className="text-sm text-gray-400">{tRank('table.avgTotalTime')}</p>
										<p className="text-2xl font-medium text-white">
											{(
												results.reduce((acc, cur) => acc + cur.totalTime, 0) /
												results.length /
												1000
											).toFixed(2)}
											s
										</p>
										<div className="mt-4">
											<p className="text-sm text-gray-400">
												{t('results.summary.maxTotalTime')}
											</p>
											<p className="text-base text-white">
												{(
													Math.max(...results.map((r) => r.totalTime)) / 1000
												).toFixed(2)}
												s
											</p>
										</div>
										<div className="mt-2">
											<p className="text-sm text-gray-400">
												{t('results.summary.minTotalTime')}
											</p>
											<p className="text-base text-white">
												{(
													Math.min(...results.map((r) => r.totalTime)) / 1000
												).toFixed(2)}
												s
											</p>
										</div>
									</div>
									<div>
										<p className="text-sm text-gray-400">{tRank('table.avgTokens')}</p>
										<p className="text-2xl font-medium text-white">
											{(
												results.reduce((acc, cur) => acc + cur.tokensPerSecond, 0) /
												results.length
											).toFixed(2)}{' '}
											t/s
										</p>
										<div className="mt-4">
											<p className="text-sm text-gray-400">
												{t('results.summary.maxTokensPerSecond')}
											</p>
											<p className="text-base text-white">
												{Math.max(...results.map((r) => r.tokensPerSecond)).toFixed(
													2
												)}{' '}
												t/s
											</p>
										</div>
										<div className="mt-2">
											<p className="text-sm text-gray-400">
												{t('results.summary.minTokensPerSecond')}
											</p>
											<p className="text-base text-white">
												{Math.min(...results.map((r) => r.tokensPerSecond)).toFixed(
													2
												)}{' '}
												t/s
											</p>
										</div>
									</div>
								</div>
							</div>
						)}
						<ResultsList
							results={results}
							streamContents={streamContents}
							expandedIndex={expandedIndex}
						/>
					</div>
				</>
			)}
		</div>
	)
}